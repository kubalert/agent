const EventEmitter = require('events');
const Utils = require('./Utils');

module.exports = class ResourceWatcher extends EventEmitter {
  constructor(watcher, path, resourceVersion) {
    super();
    this.watcher = watcher;
    this.path = path;
    this.resourceVersion = resourceVersion;
    this.request = null;
    this.isWatchable = true;
  }

  async start() {
    if (!this.isWatchable) {
      return;
    }

    await this.stop();
    this.request = await this.watcher.kubeWatcher.watch(this.path, {resourceVersion: this.resourceVersion}, (type, object) => {
      if (!object) {
        return;
      }
      if (type === 'ERROR' && object.code === 410) {
        this.resourceVersion = 0;
        return;
      }

      if (object && object.metadata && object.metadata.resourceVersion) {
        this.resourceVersion = object.metadata.resourceVersion;
        if (object.kind.includes('Secret')) {
          for (const key in object.data) {
            object.data[key] = Utils.hashSecret(object.data[key]);
          }
        }
      }
      this.emit(type, object);
    }, err => {
      if (err) {
        if (this.request.response.statusCode === 401) {
          console.warn('Cannot watch ' + this.path);
        }
        if (this.request.response.statusCode >= 400 && this.request.response.statusCode < 500) {
          this.isWatchable = false;
        }
      }
      setTimeout(() => {
        this.start();
      }, 1000);
    });
  }

  async stop() {
    if (this.request) {
      this.request.abort();
    }
  }
}
