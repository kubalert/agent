const EventEmitter = require('events');

module.exports = class State extends EventEmitter {
  constructor() {
    super();
    this.data = {};
  }

  addResourceList(resourceList) {
    resourceList.items.forEach(item => {
      item.apiVersion = resourceList.apiVersion;
      item.kind = resourceList.kind.slice(0, -4);
      if (item.kind !== 'Event') {
        this.data[this.hash(item)] = item;
      }
    });
  }

  addEvent(type, event) {
    if (type === 'ADDED' || type === 'MODIFIED') {
      this.emit('change', {
        type,
        old: type === 'MODIFIED' ? this.data[this.hash(event)] : null,
        new: event,
      });
      if (event.kind !== 'Event') {
        this.data[this.hash(event)] = event;
      }
    } else if (type === 'DELETED') {
      this.emit('change', {
        type,
        old: this.data[this.hash(event)],
        new: null,
      });
      delete this.data[this.hash(event)];
    }
  }

  hash(item) {
    return [item.apiVersion, item.kind, item.metadata.namespace, item.metadata.name].join(',');
  }
}
