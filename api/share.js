export default async function handler(req, res) {
  // CORS Headers for browser calls
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Appwrite-Project");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const endpoint = "https://sgp.cloud.appwrite.io/v1";
  const projectId = "6ae0606a00131d3f9e1e";
  const databaseId = "docuverse_db";
  const collectionId = "documents";

  // POST: Save shared document to cloud
  if (req.method === "POST") {
    try {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const appwriteRes = await fetch(`${endpoint}/databases/${databaseId}/collections/${collectionId}/documents`, {
        method: "POST",
        headers: {
          "X-Appwrite-Project": projectId,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await appwriteRes.json();
      return res.status(appwriteRes.status).json(data);
    } catch (err) {
      return res.status(500).json({ message: err.message || "Failed to save document to cloud" });
    }
  }

  // GET: Fetch shared document by id
  if (req.method === "GET") {
    const { id, share, s } = req.query;
    const docId = id || share || s;
    if (!docId) {
      return res.status(400).json({ message: "Missing document id parameter" });
    }
    try {
      const appwriteRes = await fetch(`${endpoint}/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(docId)}`, {
        headers: {
          "X-Appwrite-Project": projectId
        }
      });
      const data = await appwriteRes.json();
      return res.status(appwriteRes.status).json(data);
    } catch (err) {
      return res.status(500).json({ message: err.message || "Failed to fetch document from cloud" });
    }
  }

  return res.status(405).json({ message: "Method Not Allowed" });
}
