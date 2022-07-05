import {
    BodyParams,
    Context,
    Controller,
    Delete,
    Get,
    Intercept,
    PathParams, PlatformResponse,
    Post,
    Put,
    QueryParams, Res,
    UseAuth
} from "@tsed/common";
import {Flight, IFlightDocument} from "../../models/flight";
import {AuthenticationMiddleware} from "../middleware/AuthenticationMiddleware";
import User, {IUserDocument} from "../../models/user";
import {EmptyResponse404} from "../interceptor/EmptyResponse404";
import {AirportModel} from "../../models/airport";
import {ApiError} from "../../utils/errors-constants";
import {AssessmentModel, IAssessmentDocument} from "../../models/assessment";
import emailService from "../../email/EmailService";
import PendingNotificationModel from "../../models/pending-notification";
import * as _ from "lodash";
import isUUID from "validator/lib/isUUID";
import Aircraft from "../../models/aircraft";
import {Permissions} from "../../utils/permissions";
import {RequiresPermission} from "../middleware/RequiresPermission";
import {DynamicFilterParser} from "../../repository/repository";
import {defaultFlightFilters, FlightDynamicFilterFactory, FlightRepository} from "../../repository/flightRepository";
import {NotFound} from "@tsed/exceptions";
import {Status} from "@tsed/schema";
import {ListModifiers, ListQueryModifiers} from "../pipes/ListModifiers";
import {AssessmentService} from "../../services/AssessmentService";
import {IApiKey} from "../../models/api-key";
import {CONTEXT_SERVICE, CONTEXT_USER} from "../context-constants";
import {CustomFieldValueModel} from "../../models/_shared/field/custom-field-value.schema";
import {AssignmentContext} from "../../reporting/reports/AssignmentContext";
import {ReportGeneratorService} from "../../reporting/ReportGeneratorService";


@Controller('flights')
@UseAuth(AuthenticationMiddleware)
export class FlightController {

    constructor(private readonly assessmentService: AssessmentService,
                private readonly reportService: ReportGeneratorService) {
    }

    @Get('/')
    @RequiresPermission([Permissions.Flight.list])
    async listFlights(@QueryParams() query: any,
                      @Context('user') requester: IUserDocument,
                      @ListModifiers() modifiers: ListQueryModifiers) {

        const filterParser = new DynamicFilterParser(defaultFlightFilters, new FlightDynamicFilterFactory());

        const flightRepository = new FlightRepository({
            filterParser: filterParser
        })
        const results = await flightRepository.findWithParams(modifiers, requester);
        const documents = await Promise.all(
            results.data.map(async r => {
                const populated = await (new Flight(r)).populate({
                    path: 'customFieldValues',
                    populate: {
                        path: 'related'
                    }
                }).execPopulate();

                return Object.assign(r, {customFieldValues: populated.customFieldValues})
            })
        );
        return {
            meta: results.meta,
            data: documents
        }
    }

    @Get('/:flightId')
    @Intercept(EmptyResponse404)
    @RequiresPermission([Permissions.Flight.read])
    async getFlight(@Context('user') requester: IUserDocument,
                    @Res() response: PlatformResponse,
                    @PathParams('flightId') flightId: string,
                    @QueryParams('format') format: string,
                    @QueryParams('include') include?: { frat?: boolean, assessment?: boolean },
    ): Promise<IFlightDocument | PlatformResponse> {

        console.log(`include=${JSON.stringify(include)}`);

        const flight = await resolveFlight(flightId, requester);

        if (!flight) {
            return;
        }

        flight.populate('pic')
            .populate('sic')
            .populate('responsiblePilot')
            .populate('aircraft')
            .populate('departure_airport')
            .populate('arrival_airport')
            .populate('frat')
            .populate('customFieldValues')
            .populate({
                path: 'customFieldValues',
                populate: {path: 'related'}
            })

        if (include?.assessment) {
            flight.populate('assessment')
        }
        await flight.execPopulate();

        if (format === 'html') {
            const context = new AssignmentContext(flight);
            const html = await this.reportService.generateHtml(context);
            return response.contentType('text/html').body(html);
        }


        return flight;
    }


    @Post('/')
    @RequiresPermission([Permissions.Flight.create])
    async createFlight(@BodyParams() body: any,
                       @Context(CONTEXT_USER) requester: IUserDocument,
                       @Context(CONTEXT_SERVICE) service: IApiKey | undefined,
    ): Promise<IFlightDocument> {

        const account = requester.account;
        const departure = await AirportModel.findOrInsertAirport(body.departure_airport, account);
        const arrival = await AirportModel.findOrInsertAirport(body.arrival_airport, account);
        const pic = await resolveUser(body, 'pic', requester);
        const sic = await resolveUser(body, 'sic', requester);
        const responsiblePilot = await resolveUser(body, 'responsiblePilot', requester);
        const aircraft = await resolveAircraft(body.aircraft, requester);

        if (!pic) {
            throw new ApiError('pic does not exist.');
        }
        if (!responsiblePilot) {
            throw new ApiError('Responsible pilot does not exist.');
        }

        const isRealSic = sic;
        let assessment: IAssessmentDocument;
        if (body.assessment) {
            assessment = await AssessmentModel.findOne({
                _id: body.assessment,
                account: requester.account._id,
            });
        }
        if (!assessment) {
            assessment = await this.assessmentService.getDefaultAssessmentForFlight(account, responsiblePilot, aircraft);
        }

        const flight: any = await Flight.create({
            account: account,
            departure_airport: departure,
            arrival_airport: arrival,
            flightDate: body.flightDate,
            pic: pic,
            sic: isRealSic ? sic : null,
            fakeSic: !isRealSic ? body?.sic : null,
            responsiblePilot: responsiblePilot,
            aircraft: aircraft,
            customIdentifier: body.customIdentifier,
            tag: body.tag,
            assessment: assessment,
            fields: assessment.settings.formFields.fields,
        });

        if (body.customFieldValues && body.customFieldValues.length > 0) {
            await CustomFieldValueModel.insertMany((body.customFieldValues).map(v => {
                return new CustomFieldValueModel(
                    Object.assign({flightId: flight._id}, v)
                )
            }))
        }


        if (!requester._id.equals(responsiblePilot._id) || service) {
            await flight.populateAll();
            await emailService.queueFlightAssignmentEmail(flight, responsiblePilot);
        }
        return flight;
    }


    @Put('/:flightId')
    @RequiresPermission([Permissions.Flight.update])
    @Intercept(EmptyResponse404)
    async updateFlight(@PathParams('flightId') flightId: string,
                       @BodyParams() body: any,
                       @Context(CONTEXT_USER) requester: IUserDocument,
                       @Context(CONTEXT_SERVICE) service: IApiKey | undefined,
    ): Promise<IFlightDocument> {

        const flight: any = await resolveFlight(flightId, requester);
        const account = requester.account;

        const departure = await AirportModel.findOrInsertAirport(body.departure_airport, account);
        const arrival = await AirportModel.findOrInsertAirport(body.arrival_airport, account);
        const pic = await resolveUser(body, 'pic', requester);
        const sic = await resolveUser(body, 'sic', requester);
        const responsiblePilot = await resolveUser(body, 'responsiblePilot', requester);
        const aircraft = await resolveAircraft(body.aircraft, requester);

        if (body.departure_airport) {
            flight.departure_airport = departure;
        }
        if (body.arrival_airport) {
            flight.arrival_airport = arrival;
        }
        if (body.flightDate) {
            flight.flightDate = body.flightDate;
        }
        if (body.pic) {
            if (!pic) {
                throw new ApiError('Pic does not exist.');
            }
            flight.pic = pic;
        }
        if (sic) {
            flight.sic = sic;
        } else if (body.sic && body.sic.firstName) {
            flight.fakeSic = body.sic
        } else if (body.sic !== undefined && !body.sic) {
            flight.sic = null; // allow unsetting a pilot
        }

        if (body.responsiblePilot) {
            if (!responsiblePilot) {
                throw new ApiError('Responsible pilot does not exist.');
            }
            flight.responsiblePilot = responsiblePilot;
        }
        if (aircraft) {
            flight.aircraft = aircraft;
        }
        if (body.score) {
            flight.score = body.score;
        }
        if (body.customIdentifier) {
            flight.customIdentifier = body.customIdentifier;
        }
        if (body.assessment) {
            const assessment = await AssessmentModel.findOne({
                _id: body.assessment,
                account: requester.account._id,
            });
            if (assessment) {
                flight.assessment = assessment._id;
            }
        }

        if (body.tag) {
            flight.tag = body.tag;
        }
        await Promise.all(
            (body.customFieldValues || []).map(async (fv) => {
                return CustomFieldValueModel.updateOne({
                    fieldName: fv.fieldName,
                    flightId: flight._id,
                }, {value: fv.value, related: fv.related});
            })
        );

        const isResponsiblePilotModified = flight.isModified('responsiblePilot');
        await flight.save();
        await flight.populate('pic')
            .populate('sic')
            .populate('responsiblePilot')
            .populate('aircraft')
            .populate('departure_airport')
            .populate('arrival_airport')
            .populate('frat')
            .execPopulate();

        const requesterIsResponsible = requester._id.equals(flight.responsiblePilot._id);
        const queueNotification = isResponsiblePilotModified &&
            (!requesterIsResponsible || !!service);

        const clearNotification = requesterIsResponsible && (!service);

        if (queueNotification) {
            await emailService.queueFlightAssignmentEmail(flight, flight.responsiblePilot);
        } else if (clearNotification) {
            await PendingNotificationModel.findOneAndDelete({flight: flight}).exec();
        }
        return flight;
    }


    @Delete('/:flightId')
    @RequiresPermission([Permissions.Flight.delete])
    @Status(204)
    async deleteFlight(@Context('user') requester: IUserDocument,
                       @PathParams('flightId') flightId: string): Promise<void> {

        const query = buildFlightQuery(flightId, requester);
        const flight = await Flight.findOneAndDelete(query).exec();
        if (!flight) {
            throw new NotFound(`Flight with ID ${flightId} does not exist`);
        }
        await PendingNotificationModel.findOneAndDelete({flight: flight._id}).exec();
    }
}


/**
 *
 * @param body
 * @param prop
 * @param requester
 * @returns {Promise<null|User>}
 */
async function resolveUser(body, prop, requester) {
    const userlike = _.get(body, prop);
    let user = null;
    if (!userlike) {
        return null;
    } else if (userlike._id) {
        user = await User.findById(userlike._id).exec();
    } else if (userlike.email) {
        // @ts-ignore
        user = await User.findByEmail(userlike.email);
    }
    if (!user) {
        return null;
    }
    const isSameAccount = checkSameAccount(user, requester);
    if (isSameAccount) {
        return user;
    }
    throw new ApiError(`User specified in field ${prop} is not a member of the account.`);
}

function checkSameAccount(requester, other) {
    const requesterAccountId = _.get(requester, 'account._id');
    const otherAccountId = _.get(other, 'account._id');
    return requesterAccountId && otherAccountId && requesterAccountId.equals(otherAccountId);
}

function parseTagType(aircraftLike) {
    if (typeof aircraftLike === 'string') {
        const re = `^(tag\\.\\w+):(\\w+)$`;
        const result = aircraftLike.match(re);
        if (result && result.length === 3) { // result[0] is the ungrouped match, so we actually expect an array length of 3
            return {
                prop: result[1],
                value: result[2]
            }
        }
    }
    return null;
}

async function resolveAircraft(aircraftLike, requester) {
    if (!aircraftLike) {
        return null;
    }
    let aircraft = null;
    if (typeof aircraftLike === 'string' && isUUID(aircraftLike)) {
        aircraft = await Aircraft.findOne({_id: aircraftLike, account: requester.account}).exec();
    } else if (aircraftLike._id) {
        aircraft = await Aircraft.findOne({_id: aircraftLike._id, account: requester.account}).exec();
    } else if (aircraftLike.designation) {
        aircraft = await Aircraft.queryByDesignation(aircraftLike.designation)
            .where({account: requester.account}).exec();

        if (!aircraft) {
            aircraft = await Aircraft.create({
                designation: aircraftLike.designation,
                account: requester.account
            })
        }
    }
    return aircraft;
}

function buildFlightQuery(idLike, user) {
    const query = {
        account: user.account,
    } as { account?: any, _id?: string };
    const tagType = parseTagType(idLike);
    if (tagType) {
        query[tagType.prop] = tagType.value
    } else {
        query._id = idLike;
    }
    return query;
}

async function resolveFlight(idLike: string, user: IUserDocument) {
    const query = buildFlightQuery(idLike, user);
    return Flight.findOne(query).exec();
}
