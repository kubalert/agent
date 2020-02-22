const { crc32 } = require('crc');

module.exports = {
  hashSecret: (value) => {
    return crc32('XdgBorMA1lxh0JVy0K18X10an5xc8llw' + value).toString(16);
  }
};
