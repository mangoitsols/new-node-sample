import moment from "moment";
import {Account} from "./account.schema";
import {IAccount, IAccountDocument, IAccountModel} from "./account.interface";

export {IAccount, IAccountDocument, IAccountModel};

export function timestampToDate(src, dest, srcProp) {
    const timestamp = src[srcProp];
    return !!timestamp ? moment.unix(timestamp) : null;
}

export const transformCustomer = {
    id: 'id',
    created: timestampToDate,
    email: 'email',
    name: 'name'
};
export const transformSubscription = {
    id: 'id',
    billing_cycle_anchor: timestampToDate,
    cancel_at_period_end: 'cancel_at_period_end',
    canceled_at: timestampToDate,
    created: timestampToDate,
    current_period_end: timestampToDate,
    current_period_start: timestampToDate,
    discount: 'discount',
    quantity: 'quantity',
    status: 'status'
};
export {Account};
export default Account;
