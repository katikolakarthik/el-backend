const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: "dkkdkm207",
  api_key: "316536499463142",
  api_secret: "AoYhgZBU02a6Vnho2kjLAepmlKk",
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