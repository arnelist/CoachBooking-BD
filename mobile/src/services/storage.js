import { ref, uploadBytes, deleteObject } from "firebase/storage";
import { storage } from "./firebase";

export async function uploadTrainerCv(uid, file) {
  const path = `trainers/${uid}/cv.pdf`;
  const response = await fetch(file.uri);
  const blob = await response.blob();
  await uploadBytes(ref(storage, path), blob, { contentType: "application/pdf" });
  return path;
}

export async function deleteFile(path) {
  await deleteObject(ref(storage, path));
}