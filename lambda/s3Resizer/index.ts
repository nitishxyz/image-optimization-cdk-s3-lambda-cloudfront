/* Amplify Params - DO NOT EDIT
	API_SUPTHOAPP_GRAPHQLAPIENDPOINTOUTPUT
	API_SUPTHOAPP_GRAPHQLAPIIDOUTPUT
	API_SUPTHOAPP_GRAPHQLAPIKEYOUTPUT
	ENV
	REGION
	STORAGE_S3SUPTHOAPPSTORAGE_BUCKETNAME
Amplify Params - DO NOT EDIT */

"use strict";

import { APIGatewayProxyEvent } from "aws-lambda";
import * as AWS from "aws-sdk";
import { Readable } from "stream";

const stream = require("stream");
const sharp = require("sharp");
const mime = require("mime/lite");
const fileType = require("file-type");

const BUCKET = process.env.BUCKET_NAME || "cdk-s3-bucket";
const CDN_URL = process.env.URL || "https://s3-resizer.nitishxyz.dev";
const s3 = new AWS.S3();

type Params = { width?: number; height?: number };

async function detectHEIF(imageStream: Readable) {
  return new Promise(async (resolve, reject) => {
    try {
      // Read the first few bytes from the image stream
      const buffer = await sharp(imageStream).toBuffer();

      // Determine the file type based on the buffer
      const type = await fileType.fromBuffer(buffer);

      // Check if the file type is HEIF
      if (type && (type.mime === "image/heif" || type.mime === "image/heic")) {
        resolve(true);
      }

      resolve(false);
    } catch (error) {
      reject(error);
    }
  });
}

export const handler = async (event: APIGatewayProxyEvent) => {
  if (event.queryStringParameters == null) {
    return {
      statusCode: 404,
      body: JSON.stringify("INVALID_QUERYSTRING"),
    };
  }

  // read key from querystring
  const key = event.queryStringParameters?.key;

  // if key is not provided, stop here
  if (!key) {
    return {
      statusCode: 404,
      body: JSON.stringify("INVALID_KEY"),
    };
  }

  let size: string | undefined = "360w";

  // check if key is a valid url

  // if (isValidUrl(key)) {
  //   console.log("key is a valid url");
  //   size = event.queryStringParameters?.size || "360w";
  // }

  const key_components = key.split("/");

  // extract file name
  const file = key_components.pop();
  // extract file size
  size = key_components.pop();

  // if file is not provided, stop here

  if (!file) {
    return {
      statusCode: 404,
      body: JSON.stringify("INVALID_FILE"),
    };
  }

  // if size is not provided, stop here
  if (!size) {
    return {
      statusCode: 404,
      body: JSON.stringify("Invalid image size."),
    };
  }

  var params: Params = {};

  // extract size from given string
  if (size.slice(-1) == "w") {
    // extract width only
    params.width = parseInt(size.slice(0, -1), 10);
  } else if (size.slice(-1) == "h") {
    // extract height only
    params.height = parseInt(size.slice(0, -1), 10);
  } else {
    // extract width & height
    var size_components = size.split("x");

    // if there aren't 2 values, stop here
    if (size_components.length != 2)
      return {
        statusCode: 404,
        body: JSON.stringify("Invalid image size."),
      };

    params = {
      width: parseInt(size_components[0], 10),
      height: parseInt(size_components[1], 10),
    };

    if (isNaN(params.width!) || isNaN(params.height!))
      return {
        statusCode: 404,
        body: JSON.stringify("Invalid image size."),
      };
  }

  // check if target key already exists
  var target = null;
  await s3
    .headObject({
      Bucket: BUCKET,
      Key: key,
    })
    .promise()
    .then((res) => (target = res))
    .catch(() => console.log("File doesn't exist."));

  // if file exists and the request is not forced, stop here
  const forced = typeof event.queryStringParameters?.force !== "undefined";
  if (target != null && !forced) {
    // 301 redirect to existing image
    return {
      statusCode: 301,
      headers: {
        location: CDN_URL + "/" + key,
      },
      body: "",
    };
  }

  // add file name back to get source key
  key_components.push(file);

  try {
    console.log(
      "existing file key_components",
      key_components,
      key_components.join("/")
    );
    const readStream = getS3Stream(key_components.join("/"));

    const stream2SharpParams = {
      ...params,
      isHeic: false,
    };

    // check if file is af heic format
    let isHeic = mime.getType(key_components.join("/")) === "image/heic";
    if (!isHeic) {
      isHeic = (await detectHEIF(readStream).catch((err) => {
        return false;
      })) as boolean;
    }

    if (isHeic) {
      stream2SharpParams.isHeic = true;
    }

    const resizeStream = stream2Sharp(stream2SharpParams);

    const { writeStream, success } = putS3Stream(key);

    // trigger stream
    readStream.pipe(resizeStream).pipe(writeStream);

    // wait for the stream
    await success;

    // 301 redirect to new image
    return {
      statusCode: 301,
      headers: {
        location: CDN_URL + "/" + key,
      },
      body: "",
    };
  } catch (err) {
    let message = "SOMETHING_WENT_WRONG";
    if (err instanceof Error) {
      message = err.message;
    }

    return {
      statusCode: 500,
      body: message,
    };
  }
};

const getS3Stream = (key: string) => {
  return s3
    .getObject({
      Bucket: BUCKET,
      Key: key,
    })
    .createReadStream();
};

const putS3Stream = (key: string) => {
  const pass = new stream.PassThrough();
  const chunks: Buffer[] = [];

  pass.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  const putObjectPromise = new Promise((resolve, reject) => {
    pass.on("end", () => {
      const buffer = Buffer.concat(chunks);
      s3.putObject(
        {
          Body: buffer,
          Bucket: BUCKET,
          Key: key,
          ContentType: "image/jpeg",
          ACL: "public-read",
        },
        (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        }
      );
    });
  });

  return {
    writeStream: pass,
    success: putObjectPromise,
  };
};

const stream2Sharp = (params: Params) => {
  return sharp()
    .toFormat("jpeg")
    .jpeg({
      quality: 100,
      mozjpeg: true,
    })
    .rotate()
    .resize(
      Object.assign(params, {
        withoutEnlargement: true,
      })
    );
};
