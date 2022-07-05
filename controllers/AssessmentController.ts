import {
    BodyParams,
    Context,
    Controller,
    Delete,
    Get,
    Intercept,
    PathParams,
    Post,
    Put,
    QueryParams,
    UseAuth
} from "@tsed/common";
import {AssessmentModel, IAssessmentDocument} from "../../models/assessment";
import {AuthenticationMiddleware} from "../middleware/AuthenticationMiddleware";
import * as _ from "lodash";
import DEFAULT_ASSESSMENT from "../../models/assessment/default-assessment";
import {BadRequest} from "@tsed/exceptions";
import {IUserDocument} from "../../models/user";
import {IAssessmentUpdateParams} from "../dto/IAssessmentUpdateParams";
import {IBelongsToDocument} from "../../models/_mixin/belongs-to-schema";
import {SettingsDefinitions} from "../../models/_mixin/settings-group/settings-group.interface";
import {LeanDocument, Model} from "mongoose";
import {EmptyResponse404} from "../interceptor/EmptyResponse404";
import {AssessmentService} from "../../services/AssessmentService";
import {
    IAssessmentQuestion,
    IAssessmentQuestionDocument,
    QuestionModel
} from "../../models/assessment/assessment-question";
import {Status} from "@tsed/schema";
import {LoggedInUser} from "../pipes/UserPipe";


@Controller('assessments')
@UseAuth(AuthenticationMiddleware)
export class AssessmentController {

    constructor(private readonly assessmentService: AssessmentService) {
    }

    @Get('/')
    async listAssessments(@Context('user') user: IUserDocument): Promise<IAssessmentDocument[]> {
        return await this.assessmentService.getAllowedAssessmentsForUser(user);
    }

    @Post('/')
    async createNewAssessment(@Context('user') user: IUserDocument,
                              @QueryParams('method') method: 'copy' | 'blank' | 'default',
                              @QueryParams('copyFrom') copyFrom?: string): Promise<LeanDocument<IAssessmentDocument>> {


        try {
            return this.assessmentService.createAssessment(user, {mode: method, copyFrom: copyFrom});
        } catch (e) {
            console.error(`createAssessment error`, e);
            throw new BadRequest('Query param "method" must be one of (blank | copy | default).');
        }
    }

    @Put('/')
    async updateMany(@LoggedInUser() user: IUserDocument,
                     @BodyParams() body: Partial<LeanDocument<IAssessmentDocument>>[]) {

        await Promise.all(
            body.map(async assessment => {
                return AssessmentModel.updateOne({
                    _id: assessment._id,
                    account: user.account,
                }, {
                    accessControl: {
                        allowedUsers: assessment.accessControl.allowedUsers
                    }
                });
            })
        )
        return AssessmentModel.find({_id: {$in: body.map(a => a._id)}});
    }

    @Get('/:id')
    @Intercept(EmptyResponse404)
    async getAssessment(@Context('user') user: IUserDocument,
                        @PathParams('id') id: string): Promise<LeanDocument<IAssessmentDocument>
        & { accessControl: { allowAll: boolean } }> {

        return this.assessmentService.getAssessment(id, user);
    }

    @Put('/:id')
    async updateAssessment(@Context('user') user: IUserDocument,
                           @PathParams('id') id: string,
                           @QueryParams('restore') restoreDefault: boolean,
                           @BodyParams() body: Partial<IAssessmentUpdateParams>,
                           @QueryParams('reset') resetFields: boolean = false
    ): Promise<IAssessmentDocument> {

        const assessment = await AssessmentModel.findOne({
            _id: id,
            account: user.account
        });

        const setCurrentAsDefault = body?.isDefault && !assessment.isDefault;

        if (body?.settings) {
            for (let [settingPath, overrideGlobal] of Object.entries(body.settings)) {
                const currentSetting: IBelongsToDocument = assessment.settings[settingPath];

                if (!currentSetting) {
                    // todo: throw an error here for invalid setting
                    continue;
                }
                if (overrideGlobal) {
                    const modelType = SettingsDefinitions.find(sd => sd.path === settingPath)?.model;
                    let newSettingDoc = await modelType.findByOwnerEntity(assessment, AssessmentModel);
                    if (!newSettingDoc) {
                        newSettingDoc = await (<Model<IBelongsToDocument>>modelType).create({
                            belongsTo: assessment._id,
                            belongsToType: 'Assessment'
                        });
                    }
                    assessment.settings[settingPath] = newSettingDoc;
                } else {
                    assessment.settings[settingPath] = user.account.settings[settingPath];
                }
            }
        }

        if (restoreDefault) {
            let assessmentParams = {account: user.account};
            Object.assign(assessmentParams, DEFAULT_ASSESSMENT);
            assessment.set(assessmentParams)
        } else {
            const changes = _.omit(body, ['account', '_id', 'settings']);
            assessment.set(changes);
        }

        await assessment.save();

        if (setCurrentAsDefault) {
            await AssessmentModel.updateMany({
                account: user.account,
                _id: {$ne: assessment._id}
            }, {isDefault: false})
        }

        return assessment.populateSettings();
    }


    @Delete('/:id')
    async deleteAssessment(@Context('user') user: IUserDocument,
                           @PathParams('id') id: string,
    ) {
        const assessment = await AssessmentModel.findOne({
            _id: id,
            account: user.account,
        });

        const assessmentsRemainingCount = await AssessmentModel.count({
            account: user.account,
            deleted: {$ne: true},
        });

        if (assessmentsRemainingCount < 2) {
            throw new BadRequest("You must have at least one assessment.");
        }
        assessment.deleted = true;
        await assessment.save();

        if (assessment.isDefault) {
            const newDefault = await AssessmentModel.findOne({
                _id: {$ne: id},
                account: user.account,
                deleted: {$ne: true},
            });

            newDefault.isDefault = true;
            await newDefault.save();
        }

    }

    @Post('/:assessmentId/:sectionId/questions')
    @Intercept(EmptyResponse404)
    async createQuestion(@Context('user') user: IUserDocument,
                         @PathParams('assessmentId') assessmentId: string,
                         @PathParams('sectionId') sectionId: string,
                         @BodyParams() body: any): Promise<LeanDocument<IAssessmentQuestionDocument>> {

        const assessment = await AssessmentModel.findOne({
            account: user.account,
            _id: assessmentId
        })
        if (!assessment) {
            return null;
        }

        const section = assessment.assessmentSections.find(s => s._id.toString() === sectionId);
        if (!section) {
            return null;
        }
        if (body.hasOwnProperty('_id') && body._id === null) {
            delete body._id;
        }
        (body.answers || []).forEach(ans => {
           if (ans.hasOwnProperty('_id') && ans._id === null) {
               delete ans._id;
           }
        });
        const question = new QuestionModel(body);
        section.questions.push(question);
        await assessment.save();
        return question;
    }

    @Put('/:assessmentId/:sectionId/questions/:questionId')
    @Intercept(EmptyResponse404)
    async updateQuestion(@Context('user') user: IUserDocument,
                         @PathParams('assessmentId') assessmentId: string,
                         @PathParams('sectionId') sectionId: string,
                         @PathParams('questionId') questionId: string,
                         @BodyParams() body: Partial<IAssessmentQuestion>
    ): Promise<LeanDocument<IAssessmentQuestionDocument>> {
        const assessment = await AssessmentModel.findOne({
            account: user.account,
            _id: assessmentId
        })
        if (!assessment) {
            return null;
        }

        const section = assessment.assessmentSections.find(s => s._id.toString() === sectionId);
        if (!section) {
            return null;
        }
        const question = section.questions.find(q => q._id.toString() === questionId);
        const changes: Partial<IAssessmentQuestion> = _.pick(body, ['question', 'tip', 'answers', 'policy', 'policySource']);
        changes?.answers.forEach(a => {
            if (!a._id) {
                delete a._id;
            }
        });
        question.set(changes);
        await assessment.save();
        return question;
    }

    @Delete('/:assessmentId/:sectionId/questions/:questionId')
    @Status(204)
    async deleteQuestion(@Context('user') user: IUserDocument,
                         @PathParams('assessmentId') assessmentId: string,
                         @PathParams('sectionId') sectionId: string,
                         @PathParams('questionId') questionId: string,) {
        const assessment = await AssessmentModel.findOne({
            account: user.account,
            _id: assessmentId
        })
        if (!assessment) {
            return null;
        }

        const section = assessment.assessmentSections.find(s => s._id.toString() === sectionId);
        if (!section) {
            return null;
        }
        section.questions = section.questions.filter(q => q._id.toString() !== questionId);
        await assessment.save();
    }
}




