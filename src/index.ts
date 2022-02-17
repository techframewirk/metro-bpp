const express = require('express');
import { Request, Response, NextFunction } from "express";
import cors from 'cors';
import key from '../config/key';

import { createKeyPair, auth } from './utils/auth';

const app = express();

//app.use(express.json());
app.use(cors());

app.use(express.json({
  verify: (req: Request, res: Response, buf: Buffer) => {
    req.rawBody = buf.toString();
  }
}));

import { sequelize } from './db/index';
import { MODELS } from './db/models';
import { setupData } from './db/models/setupData';


(async () => {
  try {
    await sequelize.addModels(MODELS);
    await sequelize.sync();
    await setupData('./gtfs-data/');
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
  
  if (process.env.sign_public_key === '' || process.env.sign_public_key === undefined || process.env.sign_private_key === '' || process.env.sign_private_key === undefined) {
    throw("Keys not found");
  }

  const PORT = process.env.PORT || 8000;
  app.use('/search', auth, require("./routes/search"));
  app.use('/auth', require("./routes/auth"));
  app.use('/health', require("./routes/health"));
  app.listen(PORT, () => {
    console.log(`Metro BPP listening on port ${PORT}`)
  })
})();