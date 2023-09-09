const Queue = require('bull');
const fs = require('fs');
const path = require('path');
const imageThumbnail = require('image-thumbnail');
const { ObjectId } = require('mongodb');
const dbClient = require('./utils/db');
const fileQueue = require('./utils/fileQueue');

const fileQueueWorker = new Worker('fileQueue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
});

fileQueueWorker.process(async (job) => {
  const { fileId, userId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  const fileDocument = await (await dbClient.userCollections())
    .findOne({ _id: ObjectId(fileId), userId });

  if (!fileDocument) {
    throw new Error('File not found');
  }

  if (fileDocument.type === 'image') {
    const filePath = fileDocument.localPath;

    const thumbnails = await imageThumbnail(filePath, { width: 500 });
    await fs.promises.writeFile(`${filePath}_500`, thumbnails);

    const thumbnails250 = await imageThumbnail(filePath, { width: 250 });
    await fs.promises.writeFile(`${filePath}_250`, thumbnails250);

    const thumbnails100 = await imageThumbnail(filePath, { width: 100 });
    await fs.promises.writeFile(`${filePath}_100`, thumbnails100);
  }
});
