const EventEmitter = require('events');
const k8s = require('@kubernetes/client-node');
const request = require('request-promise-native');
const ResourceWatcher = require('./ResourceWatcher');
const Utils = require('./Utils');

module.exports = class Watcher extends EventEmitter {
  constructor(kubeConfig, state) {
    super();
    this.kubeConfig = kubeConfig;
    this.state = state;
    this.kubeWatcher = new k8s.Watch(kubeConfig);
    this.resourceWatchers = [];
    this.handler = (type, event) => {
      try {
        if (type !== 'ERROR') {
          this.state.addEvent(type, event);
        }
        this.emit(type, event);
      } catch (err) {
        console.error(err);
      }
    };
  }

  get active() {
    return this.resourceWatchers.map(rw => rw.isWatchable).length > 0;
  }

  async init() {
    await this.stop();
    this.resourceWatchers = [];

    const apiGroupList = await this.request({uri: '/apis'});
    const apiGroupVersions = {};
    apiGroupVersions[apiGroupList.apiVersion] = {
      version: apiGroupList.apiVersion,
      groupVersion: apiGroupList.apiVersion,
      path: '/api/' + apiGroupList.apiVersion,
    };
    apiGroupList.groups.forEach(group => {
      group.versions.forEach(gv => {
        apiGroupVersions[gv.groupVersion] = {
          version: gv.version,
          groupVersion: gv.groupVersion,
          path: '/apis/' + gv.groupVersion,
        };
      });
    });

    const apiResourceLists = await Promise.all(Object.values(apiGroupVersions).map(gv => this.request({uri: gv.path})));
    const apiResourcePaths = [];
    apiResourceLists.forEach(resourceList => {
      resourceList.resources.forEach(resource => {
        if (resource.verbs.includes('get') && !resource.name.includes('/')) {
          apiResourcePaths.push(apiGroupVersions[resourceList.groupVersion].path + '/' + resource.name);
        }
      });
    });

    const gets = await Promise.all(apiResourcePaths.map(resourcePath => {
      return new Promise(resolve => {
        this.request({uri: resourcePath}).then(body => {
          resolve(body);
        }).catch(err => {
          console.warn('Cannot access', resourcePath + ':', err.message);
          resolve(null);
        });
      });
    }));
    gets.forEach((get, index) => {
      if (!get || !get.kind) {
        return;
      }
      const resourcePath = apiResourcePaths[index];
      if (get.kind.includes('Secret')) {
        get.items.forEach(item => {
          for (const key in item.data) {
            item.data[key] = Utils.hashSecret(item.data[key]);
          }
        });
      }
      this.state.addResourceList(get);
      const rw = new ResourceWatcher(this, resourcePath, get.metadata.resourceVersion);
      this.resourceWatchers.push(rw);
      ['ADDED', 'MODIFIED', 'DELETED', 'ERROR'].forEach(type => {
        rw.on(type, event => {
          this.handler(type, event);
        });
      });
    });
  }

  async start() {
    await Promise.all(this.resourceWatchers.map(rw => rw.start()));
  }

  async stop() {
    await Promise.all(this.resourceWatchers.map(rw => rw.stop()));
  }

  async request(options) {
    options.uri = this.kubeConfig.getCurrentCluster().server + options.uri;
    options.json = true;
    this.kubeConfig.applyToRequest(options);
    return request(options);
  }
}
