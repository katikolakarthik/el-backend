const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: "dppiuypop",
  api_key: "412712715735329",
  api_secret: "m04IUY0-awwtr4YoS-1xvxOOIzU",
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "uploads",
    resource_type: "auto",
    allowed_formats: ["jpg", "png", "jpeg", "pdf", "mp4", "webp"],
  },
});

const upload = multer({ storage });

module.exports = { cloudinary, upload };