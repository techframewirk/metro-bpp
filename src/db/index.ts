const { Sequelize } = require('sequelize-typescript');

const { db_config } = require('../../config/db');

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  logging: false
})
