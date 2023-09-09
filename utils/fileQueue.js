const Queue = require('bull');

const fileQueue = new Queue('fileQueue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
});

module.exports = fileQueue;
