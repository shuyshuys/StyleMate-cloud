const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const tf = require('@tensorflow/tfjs-node');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

// const serviceAccountPath = path.join(__dirname, process.env.GCP_SERVICE_ACCOUNT_FILE_PATH);

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: 'uploads/' });
const modelName = process.env.MODEL_FILE_NAME;

app.post('/uploadImage', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    const imageFile = req.file;
    // Read the image data
    const imageBuffer = await fs.promises.readFile(imageFile.path);

    // Validate the file
    if (!imageFile.originalname.match(/\.(jpg|jpeg|png)$/)) {
      return res.status(400).send('Only image files are allowed!');
    }

    // Process the image
    const imageTensor = tf.browser.decodeImage(imageBuffer, 3);
    const processedImage = await tf.image.resizeBilinear(imageTensor, [224, 224]); // Adjust dimensions as needed

    // Load the model
    const model = await loadModelFromGCS(modelName);
    console.log('Model loaded successfully!');
    // Feed the image to the model and obtain predictions
    const predictions = await model.predict(tf.expandDims(processedImage, 0));

    // Return a response with the image URL in GCS
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while processing the image.');
  }
  
    // const imageFile = req.file;
    // // Read the image data
    // const imageBuffer = await fs.promises.readFile(imageFile.path);
    // // Get name of image
    // const fileName = req.file.originalname;
    // console.log(`Extension: ${fileName}`);
    // // Get extension
    // const extension = path.extname(req.file.originalname);
    // console.log(`Extension: ${extension}`);
    // // Generate a UUID and change photo name to UUID.extension
    // const uuid = uuidv4();
    // const uniqueFileName = `${uuid}${extension}`;

    // // Get a bucket and file reference
    // const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    // const file = bucket.file(uniqueFileName);

    // // Upload the image to GCS
    // await file.save(imageBuffer);

    // // Delete the temporary file
    // await fs.promises.unlink(imageFile.path);

    // // Return a response with the image URL in GCS
    // const imageUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
    // // res.json({ imageUrl });

    // const model = await loadModelFromGCS(modelName);
    // console.log('Model loaded successfully!');
});

const storage = new Storage({
    keyFilename: process.env.GCP_SERVICE_ACCOUNT_FILE_PATH,
});

// Func to load model from Google Cloud Storage
async function loadModelFromGCS(modelName) {
    const bucket = storage.bucket(process.env.GCS_BUCKET_MODEL_NAME);

    // Create the photos directory if it doesn't exist
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
    }

    // Download the model.json file
    const modelFile = bucket.file(modelName);
    const [modelJson] = await modelFile.download();
    fs.writeFileSync(path.join(uploadDir, 'model.json'), modelJson);

    // Download the weights files
    const [files] = await bucket.getFiles();
    const weightsFiles = files.filter(file => file.name.startsWith('group') && file.name.endsWith('.bin'));
    // const [files] = await bucket.getFiles({ prefix: `${modelName}/` });
    await Promise.all(weightsFiles.map(async (file) => {
        if (file.name.endsWith('.bin')) {
            const [weights] = await file.download();
            fs.writeFileSync(path.join(uploadDir, path.basename(file.name)), weights);
            const filePath = path.join(uploadDir, path.basename(file.name));
            console.log(`Downloaded ${file.name} to ${filePath}`);
        }
    }));

    // Load the model from the local files
    const model = await tf.loadLayersModel('file://' + path.join(uploadDir, 'model.json'));

    return model;
}
// async function loadModelFromGCS(modelName) {
//   const bucket = storage.bucket(process.env.GCS_BUCKET_MODEL_NAME);

//   const file = bucket.file(modelName);
//   const modelBuffer = await file.download();

//   // return tf.loadLayersModel(tf.node.decodeWeights(modelBuffer[0]));
//   // Decode and load model weights
//   const modelBufferArray = await tf.node.decodeWeights(modelBuffer);
//   model = await tf.loadLayersModel(modelBufferArray[0]);
// }

// // Load the model
// const model = await tf.loadLayersModel('model.json');

// // Pre-process the image
// const imageTensor = tf.browser.decodeImage(imageBuffer, 3);
// const processedImage = await tf.image.resizeBilinear(imageTensor, [224, 224]); // Adjust dimensions as needed

// // Feed the image to the model and obtain predictions
// const predictions = await model.predict(tf.expandDims(processedImage, 0));

// res.json({ predictions });

app.get('/test-model-load', async (req, res) => {
    try {
        const model = await loadModelFromGCS(process.env.MODEL_FILE_NAME);
        console.log('Model loaded successfully!');
        res.status(200).send('Model loaded successfully!');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading model!');
    }
});

app.listen(PORT, () => console.log('Server listening on port 3000'));