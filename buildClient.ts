import dtsGenerator, { DefaultTypeNameConvertor, SchemaId } from "dtsgenerator";
import { promises as fs } from "fs";
import * as request from "request-promise";
import { Project, Scope } from "ts-morph";
import { WebClient } from "@slack/client";
import { MethodDeclaration } from "typescript";

// initialize
const outputProject = new Project({
  compilerOptions: { outDir: "dist", declaration: true }
});

const slackApiDocUrl =
  "https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json";

const replacedNames = { $200: "Success", Default: "Error" };

function typeNameConvertor(id: SchemaId): string[] {
  let names = DefaultTypeNameConvertor(id);
  if (names.length > 0) {
    const lastIndex = names.length - 1;
    names[lastIndex] = names[lastIndex];
  }
  names = names.map(name => {
    return Object.keys(replacedNames).includes(name)
      ? (<any>replacedNames)[name]
      : name;
  });
  return names;
}
var YsakON = {
  // YsakObjectNotation
  stringify: function(o: any, prefix: any) {
    prefix = prefix || "root";

    switch (typeof o) {
      case "object":
        if (Array.isArray(o)) return prefix + "=" + JSON.stringify(o) + "\n";

        var output = "";
        for (var k in o) {
          if (o.hasOwnProperty(k))
            output += this.stringify(o[k], prefix + "." + k);
        }
        return output;
      case "function":
        return "";
      default:
        return prefix + "=" + o + "\n";
    }
  }
};

function iterate<T>(obj: T, filter: (value: any) => boolean = () => true) {
  var walked = [];
  var stack = [{ obj: obj, stack: "" }];
  let members = [];
  while (stack.length > 0) {
    var item = <any>stack.pop();
    var obj = <T>item.obj;
    for (var property in obj) {
      if (obj.hasOwnProperty(property)) {
        if (typeof obj[property] == "object") {
          var alreadyFound = false;
          for (var i = 0; i < walked.length; i++) {
            if (walked[i] === obj[property]) {
              alreadyFound = true;
              break;
            }
          }
          if (!alreadyFound) {
            walked.push(obj[property]);
            stack.push({
              obj: <any>obj[property],
              stack: item.stack + "." + property
            });
          }
        } else {
          if (filter(obj[property])) {
            members.push(item.stack + "." + property);
          }
        }
      }
    }
  }
  return members;
}

function toCamelCase(str: string) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, function(word: string, index: number) {
      return index == 0 ? word.toLowerCase() : word.toUpperCase();
    })
    .replace(/\s+/g, "");
}

async function main(): Promise<void> {
  const slack = new WebClient();
  let slackApiDoc = await request.get(slackApiDocUrl, { json: true });

  const typeDefinitions = await dtsGenerator({
    contents: [slackApiDoc],
    typeNameConvertor
  });
  let typeDefFile = outputProject.createSourceFile(
    "dist/slackTypes.ts",
    typeDefinitions
  );

  typeDefFile
    .getNamespaceOrThrow("Paths")
    .getNamespaces()
    .forEach(nameSpace => {
      let responsesNamespace = nameSpace
        .setIsExported(true)
        .getNamespaceOrThrow("Responses");
      let predicateClasss = responsesNamespace
        .setIsExported(true)
        .addClass({ name: "SuccessOrErrorPredicate", isExported: true });
      predicateClasss
        .addConstructor({
          parameters: [
            { scope: Scope.Private, name: "response", type: "Success | Error" }
          ]
        })
        .setBodyText("");
      predicateClasss
        .addMethod({
          name: "isSuccess",
          returnType: "this is Success"
        })
        .setBodyText("return JSON.parse((<Error>this.response).ok) == false;");
      let success = responsesNamespace.getInterface("Success");
      if (success != null) {
        let indexSignature = success.getIndexSignature(() => true);
        if (indexSignature) {
          indexSignature.remove();
        }
      }
      let error = responsesNamespace.getInterface("Error");
      if (error != null) {
        let indexSignature = error.getIndexSignature(() => true);
        if (indexSignature) {
          indexSignature.remove();
        }
      }
    });

  let slackFunctionMembers = iterate(
    slack,
    property => typeof property == "function"
  );

  let slackTypeDefinitions = slackFunctionMembers.map(member => {
    return member
      .split(".")
      .map(key => key.charAt(0).toUpperCase() + key.slice(1))
      .join("");
  });

  let missingDefinitions = slackTypeDefinitions.filter(
    definition =>
      !typeDefFile
        .getNamespaceOrThrow("Paths")
        .getNamespaces()
        .map(namespace => namespace.getName())
        .includes(definition)
  );
  console.warn(
    `Failed to find the following definitions in the Slack API definition:`,
    ...missingDefinitions
  );

  slackTypeDefinitions = slackTypeDefinitions.filter(definition =>
    typeDefFile
      .getNamespaceOrThrow("Paths")
      .getNamespaces()
      .map(namespace => namespace.getName())
      .includes(definition)
  );
  let slackArgumentsFile = outputProject.addExistingSourceFile(
    "./node_modules/@slack/web-api/dist/methods.d.ts"
  );

  let slackArguments = slackArgumentsFile
    .getInterfaces()
    .filter(
      argInterface =>
        argInterface.isExported() && !argInterface.isDefaultExport()
    )
    .map(argInterface => argInterface.getName());
  let clientFile = outputProject.createSourceFile("dist/slackTypedClient.ts");
  let clientClass = clientFile.addClass({ name: "SlackTypedClient" });

  slackTypeDefinitions.forEach(definition => {
    let argumentType = slackArguments.find(
      slackArgumentInterface =>
        slackArgumentInterface.localeCompare(
          definition + "Arguments",
          undefined,
          {
            sensitivity: "accent"
          }
        ) === 0
    );
    if (argumentType == null) {
      console.warn(
        "Failed to find matching slack arguments for class: ",
        definition
      );
      return;
    }
    let slackMethod = slackFunctionMembers.find(member => {
      return slackTypeDefinitions.some(
        definition =>
          member
            .split(".")
            .join("")
            .localeCompare(definition, undefined, {
              sensitivity: "accent"
            }) === 0
      );
    });
    clientClass
      .addMethod({
        name: toCamelCase(definition),
        parameters: [{ name: "args", type: argumentType }],
        returnType: `Promise<(Paths.${definition}.Responses.Success | Paths.${definition}.Responses.Error) & Paths.${definition}.Responses.SuccessOrErrorPredicate>`,
        isAsync: true
      })
      .setBodyText(
        `let response = <any>await this.slack${slackMethod}(args);
response["isSuccess"] = new Paths.AuthTest.Responses.SuccessOrErrorPredicate(response).isSuccess();
return response;`
      );
  });
  clientClass.addProperty({ type: "WebClient", name: "slack" });
  clientClass
    .addConstructor({
      parameters: [{ type: "WebClient", name: "slack" }]
    })
    .setBodyText("this.slack = slack");
  clientFile.addImportDeclaration({
    namedImports: ["WebClient"],
    moduleSpecifier: "@slack/client"
  });

  clientFile.addImportDeclaration({
    namedImports: slackArguments,
    moduleSpecifier: "@slack/web-api/dist/methods"
  });
  clientFile.addImportDeclaration({
    namedImports: ["Paths", "Definitions"],
    moduleSpecifier: "./slackTypes"
  });

  typeDefFile
    .getNamespaceOrThrow("Paths")
    .setHasDeclareKeyword(false)
    .setIsExported(true);
  typeDefFile
    .getNamespaceOrThrow("Definitions")
    .setHasDeclareKeyword(false)
    .setIsExported(true);

  await outputProject.save();
}
main();
