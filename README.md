#check cd

pip install -r requirements.txt

# Submit the build to Cloud Build

gcloud builds submit --tag gcr.io/model-api-389409/predict_image

# Deploy the container to Cloud Run

gcloud run deploy --image gcr.io/model-api-389409/predict_image
