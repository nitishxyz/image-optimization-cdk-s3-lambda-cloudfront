const fs = require("fs");
const path = require("path");

async function main() {
  console.log(`Updating S3 bucket policy`);

  const fileName = path.join(
    __dirname,
    `../cdk.out/ImageOptimizationCdkS3LambdaCloudfrontStack.template.json`
  );

  fs.readFile(fileName, "utf8", (err, data) => {
    if (err) {
      console.error(`Error reading file: ${err}`);
      return;
    }

    let json = JSON.parse(data);

    const resources = json.Resources;

    if (!resources) {
      console.error(`No "Resources" found in the JSON file`);
      return;
    }

    const bucketPolicyResource = Object.values(resources).find(
      (resource) => resource.Type === "AWS::S3::BucketPolicy"
    );

    if (
      !bucketPolicyResource ||
      !bucketPolicyResource.Properties ||
      !bucketPolicyResource.Properties.PolicyDocument
    ) {
      console.error(
        `No bucket policy found in the JSON file for "Type": "AWS::S3::BucketPolicy"`
      );
      return;
    }

    const statementArray =
      bucketPolicyResource.Properties.PolicyDocument.Statement;

    if (!Array.isArray(statementArray) || statementArray.length === 0) {
      console.error(
        `No statements found in the bucket policy for "Type": "AWS::S3::BucketPolicy"`
      );
      return;
    }

    // Perform actions with the statement array here
    console.log("Statement Array:", statementArray);

    statementArray.shift();

    const updatedJson = JSON.stringify(json, null, 2);

    fs.writeFile(fileName, updatedJson, "utf8", (err) => {
      if (err) {
        console.error(`Error writing file: ${err}`);
        return;
      }
      console.log(`First statement removed from ${fileName}`);
    });
  });
}

main();
