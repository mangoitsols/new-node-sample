import {
    BodyParams,
    Controller,
    Delete,
    Get,
    MulterOptions,
    MultipartFile,
    PathParams,
    PlatformMulterFile,
    Post,
    Put,
    UseAuth
} from "@tsed/common";
import {AuthenticationMiddleware} from "../middleware/AuthenticationMiddleware";
import {IUserDocument} from "../../models/user";
import {AircraftRepository} from "../../repository/aircraftRepository";
import Aircraft, {AircraftModel} from "../../models/aircraft";
import {ListModifiers, ListQueryModifiers} from "../pipes/ListModifiers";
import {LoggedInUser} from "../pipes/UserPipe";
import {RequiresPermission} from "../middleware/RequiresPermission";
import {Permissions} from "../../utils/permissions";
import * as _ from "lodash";
import {Returns} from "@tsed/schema";
import csvParse from "csv-parse/lib/sync";
import {ApiErrors} from "../../utils/errors-constants";
import {BadRequest} from "@tsed/exceptions";
import {AssessmentService} from "../../services/AssessmentService";
import {AircraftBulkUpdateDto} from "../dto/AircraftBulkUpdateDto";

@Controller('/aircrafts')
@UseAuth(AuthenticationMiddleware)
export class AircraftController {

    constructor(private repository: AircraftRepository,
                private assessmentService: AssessmentService) {
    }

    @Get('')
    @RequiresPermission([Permissions.Aircraft.list])
    async list(@LoggedInUser() requester: IUserDocument,
               @ListModifiers() params: ListQueryModifiers) {
        const results = await this.repository.findWithParams(params, requester);
        return (results.data || []);
    }

    @Get('/:id')
    @RequiresPermission([Permissions.Aircraft.read])
    async get(@LoggedInUser() user: IUserDocument,
              @PathParams('id') aircraftId: string) {

        const aircraft = await Aircraft.findOne({account: user.account, _id: aircraftId})
            .populate('defaultAssessment');

        // todo: move lookup logic to repository
        if (!aircraft.defaultAssessment) {
            aircraft.defaultAssessment = await this.assessmentService.getDefaultAssessmentForAccount(user.account);
        }
        return aircraft;
    }


    @Post('')
    @RequiresPermission([Permissions.Aircraft.create])
    async create(@LoggedInUser() user: IUserDocument,
                 @BodyParams() body: any) {
        const params = {
            account: user.account,
            dateAdded: Date.now(),
            designation: body.designation,
            type: body.type,
            defaultAssessment: await this.assessmentService.getAssessment(body.defaultAssessment, user)
        };
        return await Aircraft.create(params);
    }

    @Put('')
    @RequiresPermission([Permissions.Aircraft.update])
    async updateMany(@LoggedInUser() user: IUserDocument,
                     @BodyParams() body: AircraftBulkUpdateDto) {

        for (const item of body) {
            await AircraftModel.update(
                {_id: item.id, account: user.account},
                {defaultAssessment: item.defaultAssessment}
            );
        }

        return AircraftModel.find({
            _id: { $in: body.map(i => i.id)}, account: user.account
        });
    }

    @Put('/:id')
    @RequiresPermission([Permissions.Aircraft.update])
    async update(@LoggedInUser() user: IUserDocument,
                 @PathParams('id') aircraftId: string,
                 @BodyParams() body: any) {

        const aircraft = await Aircraft.findOne({account: user.account, _id: aircraftId}).exec();
        const params = {
            designation: body.designation,
            type: body.type,
            defaultAssessment: await this.assessmentService.getAssessment(body.defaultAssessment, user)
        };
        aircraft.set(params);
        await aircraft.save();
        return aircraft;
    }

    @Delete('/:id')
    @RequiresPermission([Permissions.Aircraft.delete])
    @Returns(204)
    async delete(@LoggedInUser() user: IUserDocument,
                 @PathParams('id') aircraftId: string) {

        await Aircraft.remove({
            account: user.account,
            _id: aircraftId
        }).exec();
    }

    @Post('/bulk-add')
    @MulterOptions({limits: {files: 1}})
    async bulkUpload(@LoggedInUser() requester: IUserDocument,
                     @MultipartFile("aircraft") file: PlatformMulterFile) {

        if (!file || !file.buffer) {
            throw new BadRequest(ApiErrors.emptyFile.message)
        }
        const aircraftCSV = file.buffer.toString();
        const aircrafts = csvParse(aircraftCSV, {
            columns: false,
            relax_column_count: true,
            from_line: 2,
            skip_lines_with_empty_values: true,
            skip_empty_lines: true,
            trim: true
        });
        if (!aircrafts || aircrafts.length === 0) {
            throw new BadRequest(ApiErrors.emptyFile.message)
        }
        const succeeded = [];
        const failed = [];
        let line = 0;
        for (let aircraft of aircrafts) {
            if (_.isEmpty(aircraft)) {
                failed.push({
                    line: line + 1,
                    message: 'Aircraft entry is empty.'
                });
                continue;
            }

            try {
                const params = {
                    account: requester.account,
                    dateAdded: Date.now()
                };

                Object.assign(params, {
                    designation: aircraft[0],
                    type: aircraft[1]
                });
                const record = await Aircraft.create(params);
                succeeded.push(record);
                line++;
            } catch (e) {
                failed.push({
                    line: line,
                    message: 'Unable to add aircraft to database'
                })
            }
        }

        return {
            succeeded: succeeded,
            failed: failed
        };
    }
}
