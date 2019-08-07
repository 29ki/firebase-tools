import * as _ from "lodash";
import { expect } from "chai";
import * as sinon from "sinon";
import * as dotenv from "dotenv";
import * as fs from "fs-extra";

import { FirebaseError } from "../../error";
import * as logger from "../../logger";
import { ModInstance, ParamType } from "../../mods/modsApi";
import * as modsHelper from "../../mods/modsHelper";
import * as paramHelper from "../../mods/paramHelper";
import * as prompt from "../../prompt";

const PROJECT_ID = "test-proj";
const TEST_PARAMS = [
  {
    param: "A_PARAMETER",
    label: "Param",
    type: ParamType.STRING,
  },
  {
    param: "ANOTHER_PARAMETER",
    label: "Another Param",
    default: "default",
    type: ParamType.STRING,
  },
];

const TEST_PARAMS_2 = [
  {
    param: "ANOTHER_PARAMETER",
    label: "Another Param",
    type: ParamType.STRING,
    default: "default",
  },
  {
    param: "NEW_PARAMETER",
    label: "New Param",
    type: ParamType.STRING,
    default: "default",
  },
  {
    param: "THIRD_PARAMETER",
    label: "3",
    type: ParamType.STRING,
    default: "default",
  },
];

const SPEC = {
  name: "test",
  roles: [],
  resources: [],
  sourceUrl: "test.com",
  params: TEST_PARAMS,
};

describe("paramHelper", () => {
  describe("getParams", () => {
    let fsStub: sinon.SinonStub;
    let dotenvStub: sinon.SinonStub;
    let getFirebaseVariableStub: sinon.SinonStub;
    let promptStub: sinon.SinonStub;
    let loggerSpy: sinon.SinonSpy;

    beforeEach(() => {
      fsStub = sinon.stub(fs, "readFileSync").returns("");
      dotenvStub = sinon.stub(dotenv, "parse");
      getFirebaseVariableStub = sinon
        .stub(modsHelper, "getFirebaseProjectParams")
        .resolves({ PROJECT_ID });
      promptStub = sinon.stub(prompt, "promptOnce").resolves("user input");
      loggerSpy = sinon.spy(logger, "info");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should read params from envFilePath if it is provided and is valid", async () => {
      dotenvStub.returns({
        A_PARAMETER: "aValue",
        ANOTHER_PARAMETER: "value",
      });

      const params = await paramHelper.getParams(PROJECT_ID, TEST_PARAMS, "./a/path/to/a/file.env");

      expect(params).to.eql({
        A_PARAMETER: "aValue",
        ANOTHER_PARAMETER: "value",
      });
    });

    it("should return the defaults for params that are not in envFilePath", async () => {
      dotenvStub.returns({
        A_PARAMETER: "aValue",
      });

      const params = await paramHelper.getParams(PROJECT_ID, TEST_PARAMS, "./a/path/to/a/file.env");

      expect(params).to.eql({
        A_PARAMETER: "aValue",
        ANOTHER_PARAMETER: "default",
      });
    });

    it("should throw if a param without a default is not in envFilePath", async () => {
      dotenvStub.returns({
        ANOTHER_PARAMETER: "aValue",
      });

      expect(
        paramHelper.getParams(PROJECT_ID, TEST_PARAMS, "./a/path/to/a/file.env")
      ).to.be.rejectedWith(
        FirebaseError,
        "A_PARAMETER has not been set in the given params file and there is no default available. " +
          "Please set this variable before installing again."
      );
    });

    it("should warn about extra params provided in the env file", async () => {
      dotenvStub.returns({
        A_PARAMETER: "aValue",
        ANOTHER_PARAMETER: "default",
        A_THIRD_PARAMETER: "aValue",
        A_FOURTH_PARAMETER: "default",
      });
      const params = await paramHelper.getParams(PROJECT_ID, TEST_PARAMS, "./a/path/to/a/file.env");

      expect(loggerSpy).to.have.been.calledWith(
        "Warning: The following params were specified in your env file but" +
          " do not exist in the spec for this mod: A_THIRD_PARAMETER, A_FOURTH_PARAMETER."
      );
    });

    it("should throw FirebaseError if an invalid envFilePath is provided", async () => {
      dotenvStub.throws({ message: "Error during parsing" });

      expect(
        paramHelper.getParams(PROJECT_ID, TEST_PARAMS, "./a/path/to/a/file.env")
      ).to.be.rejectedWith(FirebaseError, "Error reading env file: Error during parsing");
    });

    it("should prompt the user for params if no env file is provided", async () => {
      const params = await paramHelper.getParams(PROJECT_ID, TEST_PARAMS);

      expect(params).to.eql({
        A_PARAMETER: "user input",
        ANOTHER_PARAMETER: "user input",
      });

      expect(promptStub).to.have.been.calledTwice;
      expect(promptStub.firstCall.args[0]).to.eql({
        default: undefined,
        message: "Enter a value for Param:",
        name: "A_PARAMETER",
        type: "input",
      });
      expect(promptStub.secondCall.args[0]).to.eql({
        default: "default",
        message: "Enter a value for Another Param:",
        name: "ANOTHER_PARAMETER",
        type: "input",
      });
    });
  });

  describe("getParamsWithCurrentValuesAsDefaults", () => {
    let params: { [key: string]: string };
    let testInstance: ModInstance;
    beforeEach(() => {
      params = { A_PARAMETER: "new default" };
      testInstance = {
        configuration: {
          source: {
            name: "",
            packageUri: "",
            hash: "",
            spec: {
              name: "",
              roles: [],
              resources: [],
              params: TEST_PARAMS,
              sourceUrl: "",
            },
          },
          name: "test",
          createTime: "now",
          params,
        },
        name: "test",
        createTime: "now",
        updateTime: "now",
        state: "ACTIVE",
        serviceAccountEmail: "test@test.com",
      };

      it("should add defaults to params without them using the current state and leave other values unchanged", () => {
        const newParams = paramHelper.getParamsWithCurrentValuesAsDefaults(testInstance);

        expect(newParams).to.eql([
          {
            param: "A_PARAMETER",
            label: "Param",
            default: "new default",
            type: "STRING",
          },
          {
            param: "ANOTHER_PARAMETER",
            label: "Another",
            default: "default",
            type: "STRING",
          },
        ]);
      });
    });

    it("should change existing defaults to the current state and leave other values unchanged", () => {
      _.get(testInstance, "configuration.source.spec.params", []).push({
        param: "THIRD",
        label: "3rd",
        default: "default",
        type: ParamType.STRING,
      });
      testInstance.configuration.params.THIRD = "New Default";
      const newParams = paramHelper.getParamsWithCurrentValuesAsDefaults(testInstance);

      expect(newParams).to.eql([
        {
          param: "A_PARAMETER",
          label: "Param",
          default: "new default",
          type: "STRING",
        },
        {
          param: "ANOTHER_PARAMETER",
          label: "Another Param",
          default: "default",
          type: "STRING",
        },
        {
          param: "THIRD",
          label: "3rd",
          default: "New Default",
          type: "STRING",
        },
      ]);
    });
  });

  describe("promptForNewParams", () => {
    let promptStub: sinon.SinonStub;
    let getFirebaseVariableStub: sinon.SinonStub;
    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      getFirebaseVariableStub = sinon
        .stub(modsHelper, "getFirebaseProjectParams")
        .resolves({ PROJECT_ID });
    });

    afterEach(() => {
      promptStub.restore();
      getFirebaseVariableStub.restore();
    });

    it("should prompt the user for any params in the new spec that are not in the current one", async () => {
      promptStub.resolves("user input");
      const newSpec = _.cloneDeep(SPEC);
      newSpec.params = TEST_PARAMS_2;

      const newParams = await paramHelper.promptForNewParams(
        SPEC,
        newSpec,
        {
          A_PARAMETER: "value",
          ANOTHER_PARAMETER: "value",
        },
        PROJECT_ID
      );

      const expected = {
        ANOTHER_PARAMETER: "value",
        NEW_PARAMETER: "user input",
        THIRD_PARAMETER: "user input",
      };
      expect(newParams).to.eql(expected);
      expect(promptStub.callCount).to.equal(2);
      expect(promptStub.firstCall.args).to.eql([
        {
          default: "default",
          message: "Enter a value for New Param:",
          name: "NEW_PARAMETER",
          type: "input",
        },
      ]);
      expect(promptStub.secondCall.args).to.eql([
        {
          default: "default",
          message: "Enter a value for 3:",
          name: "THIRD_PARAMETER",
          type: "input",
        },
      ]);
    });

    it("shouldn't prompt if there are no new params", async () => {
      promptStub.resolves("Fail");
      const newSpec = _.cloneDeep(SPEC);

      const newParams = await paramHelper.promptForNewParams(
        SPEC,
        newSpec,
        {
          A_PARAMETER: "value",
          ANOTHER_PARAMETER: "value",
        },
        PROJECT_ID
      );

      const expected = {
        ANOTHER_PARAMETER: "value",
        A_PARAMETER: "value",
      };
      expect(newParams).to.eql(expected);
      expect(promptStub).not.to.have.been.called;
    });

    it("should exit if a prompt fails", async () => {
      promptStub.rejects(new FirebaseError("this is an error"));
      const newSpec = _.cloneDeep(SPEC);
      newSpec.params = TEST_PARAMS_2;

      await expect(
        paramHelper.promptForNewParams(
          SPEC,
          newSpec,
          {
            A_PARAMETER: "value",
            ANOTHER_PARAMETER: "value",
          },
          PROJECT_ID
        )
      ).to.be.rejectedWith(FirebaseError, "this is an error");
      // Ensure that we don't continue prompting if one fails
      expect(promptStub).to.have.been.calledOnce;
    });
  });
});
