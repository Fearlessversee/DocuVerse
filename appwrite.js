import { Client } from "appwrite";

const client = new Client()
  .setEndpoint("https://sgp.cloud.appwrite.io/v1")
  .setProject("6ae0606a00131d3f9e1e");

export { client };

client.ping().then(response => {
  console.log("Appwrite setup verified successfully:", response);
}).catch(err => {
  console.warn("Appwrite ping notice:", err);
});
