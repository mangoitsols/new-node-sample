import {SiteAdmin} from '../models/site-admin'
import config from '../config/config';
import * as _ from 'lodash';
import {randomPassword} from "../utils/crypto";

/**
 * Make any changes you need to make to the database here
 */
async function up () {
  // Write migration here

  const admins = _.get(config, 'ADMIN.ADMINS', []);

  for(let admin of admins) {
      const hash = await randomPassword();
      try {
        await SiteAdmin.create({name: admin.name, email: admin.email, password: hash});
      } catch (e) {
        console.warn(`Cannot insert ${admin.email}: already exists.`);
      }
  }
}
/**
 * Make any changes that UNDO the up function side effects here (if possible)
 */
async function down () {
  // Write migration here
}
module.exports = { up, down };
