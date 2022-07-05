import {VendorModel} from "../models/vendor";
import {v4 as uuidv4} from "uuid"

async function up () {

    await VendorModel.create({
        name: 'Preflight Mitigator',
        description: 'Default Vendor',
        token: uuidv4(),
        clientConfig: [],
        config: [
            {
                option: 'emailTemplate',
                value: 'GenericWelcomeEmail'
            }
        ]
    })

    await VendorModel.create({
        name: 'Airplane Manager',
        description: 'Airplane Manager',
        token: uuidv4(),
        clientConfig: [
            {
                option: 'skipOnboarding',
                value: 'true'
            }
        ],
        config: [
            {
                option: 'emailTemplate',
                value: 'AirplaneManagerWelcomeEmail'
            }
        ]
    });
}
/**
 * Make any changes that UNDO the up function side effects here (if possible)
 */
async function down () {
  // Write migration here
}
module.exports = { up, down };
