import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
const client = new DynamoDB({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

export async function putCommandHelper(tableName: string, item: Record<string, string>) {
    await ddbDocClient.send(new PutCommand({
        TableName: tableName,
        Item: item
    }))
}

export async function getDataHelperFunction(tableName: string, groupId: string) {
// export async function getDataHelperFunction(tableName: string) {
    const data = await ddbDocClient.send(new ScanCommand({
        TableName: tableName
    }));
    const connectionsInGroup = (data.Items || []).filter(
        (item) => item.groupId === groupId
    );
    return connectionsInGroup
}

export async function deleteCommandHelperFunction(tableName:string, connectionId: string) {
    await ddbDocClient.send(new DeleteCommand({
        TableName: tableName,
        Key: {
           connectionID:  connectionId
        }
    }));
}