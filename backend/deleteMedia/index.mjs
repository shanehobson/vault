import { S3, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';

const s3 = new S3({});
const dynamoDb = new DynamoDBClient({});

// Set as Lambda environment variables (see backend/README.md)
const requireEnv = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
};
const bucketName = requireEnv('MEDIA_BUCKET');
const tableName = requireEnv('MEDIA_TABLE');

/** The verified Cognito `sub`, injected by the API Gateway mapping template. */
const callerSub = (event) =>
  typeof event.callerSub === 'string' && /^[0-9a-f-]{36}$/.test(event.callerSub) ? event.callerSub : null;

export const handler = async (event) => {
  try {
    const { mediaIds } = event;
    const userId = callerSub(event);
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: '❌ Invalid input: mediaIds array is required.' }),
      };
    }

    // Every key must belong to the caller: mediaId is the S3 key uploads/<sub>/<file>
    const prefix = `uploads/${userId}/`;
    if (!mediaIds.every((id) => typeof id === 'string' && id.startsWith(prefix) && !id.includes('..'))) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'One or more mediaIds do not belong to the caller.' }),
      };
    }

    console.log(`🚀 Deleting ${mediaIds.length} items for user: ${userId}`);

    // Prepare batch delete request for DynamoDB
    const deleteRequests = mediaIds.map((mediaId) => {
      console.log(`🔹 Deleting from DynamoDB: userId = ${userId}, mediaId = ${mediaId}`);

      return {
        DeleteRequest: {
          Key: {
            userId: { S: userId },
            mediaId: { S: mediaId },
          },
        },
      };
    });

    // Split into batches of 25 (DynamoDB limit)
    const batchRequests = [];
    while (deleteRequests.length) {
      batchRequests.push(deleteRequests.splice(0, 25));
    }

    for (const batch of batchRequests) {
      const response = await dynamoDb.send(new BatchWriteItemCommand({ RequestItems: { [tableName]: batch } }));

      if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
        console.warn("⚠️ Some items were not processed in DynamoDB delete:", response.UnprocessedItems);
      }
    }

    // Delete from S3
    await Promise.all(
      mediaIds.map(async (s3Key) => {
        console.log(`🔹 Deleting from S3: ${bucketName} -> ${s3Key}`);

        try {
          await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: s3Key }));
        } catch (s3Error) {
          console.error(`❌ Error deleting ${s3Key} from S3:`, s3Error);
        }
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: '✅ Files successfully deleted.' }),
    };
  } catch (error) {
    console.error('❌ Error in delete Lambda function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};
