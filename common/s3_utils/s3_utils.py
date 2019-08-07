from io import StringIO
import os
import boto3

def do_s3_stuff():
    bucket_name = "alp-reports-lambda"
    environment = "dev" if os.environ.get('LOCAL') else "prod"
    object_key = f"{environment}/reports/test"

    s3_resource = boto3.resource('s3')
    print(s3_resource)
    print('done doing s3 stuff')


def upload_df_to_s3(df, file_name, with_index=False):
    """
    df: the source dataframe to upload
    file_name: e.g. PaymentPosting_Summary_09_24_2018.csv
    with_index: whether or not the pandas DataFrame should write with index
    - Uploads to reports folder under dev or prod and gives public read permissions
    """

    csv_buffer = StringIO()
    df.to_csv(csv_buffer, index=with_index)

    bucket_name = "alp-reports-lambda"
    environment = "dev" if os.environ.get('LOCAL') else "prod"
    object_key = f"{environment}/reports/{file_name}"

    s3_resource = boto3.resource('s3')
    s3_resource.Object(bucket_name, object_key).put(ACL='public-read', Body=csv_buffer.getvalue())
    return f"https://s3.amazonaws.com/{bucket_name}/{object_key}"


def upload_from_path_to_s3(file_path):
    """
    Directly upload a report via its filepath.
    When hosted on lambda, typically a file path to a temporary directory.
    ACL: public-read required for S3 link public read permissions
    """
    bucket_name = "alp-reports-lambda"
    environment = "dev" if os.environ.get('LOCAL') else "prod"
    object_key = f"{environment}/835/{file_path.split('/')[-1]}"

    s3 = boto3.resource('s3')
    s3.Object(bucket_name, object_key).upload_file(file_path, ExtraArgs={'ACL': 'public-read'})

    return f"https://s3.amazonaws.com/{bucket_name}/{object_key}"
