import fs from "fs/promises";
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.resolve(__filename, "../..");

async function generateReleaseData() {
  const dataFilePath = path.resolve(
    __dirname,
    "src",
    "data",
    "release-data.json",
  );

  try {
    const response = await fetch(
      "https://api.github.com/repos/ph-design/zmk-studio/releases/latest",
      {
        headers: process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {},
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
    await fs.writeFile(dataFilePath, JSON.stringify(data));

    console.log("Release data generated successfully!");
  } catch (error) {
    try {
      await fs.access(dataFilePath);
      console.warn("Failed to refresh release data; using cached release-data.json.");
      console.warn(error);
      return;
    } catch {
      console.error("Error generating release data:", error);
    }

    process.exit(1);
  }
}

generateReleaseData();
