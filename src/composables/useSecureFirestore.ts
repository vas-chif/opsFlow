/**
 * @file useSecureFirestore.ts
 * @description Secure wrapper for Firestore CRUD operations with automatic secure logging and PII protection.
 * @author Vasile Chifeac
 * @created 2026-07-31
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  type DocumentData,
  type QuerySnapshot,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/boot/firebase";
import { useSecureLogger } from "@/composables/useSecureLogger";

export function useSecureFirestore() {
  const logger = useSecureLogger();

  /**
   * Secure fetch of a single Firestore document.
   */
  async function secureGetDoc(
    collectionPath: string,
    docId: string,
  ): Promise<DocumentSnapshot<DocumentData> | null> {
    try {
      const dRef = doc(db, collectionPath, docId);
      const snapshot = await getDoc(dRef);
      logger.info("Firestore", `getDoc: ${collectionPath}/${docId}`, { exists: snapshot.exists() });
      return snapshot;
    } catch (error) {
      logger.error("Firestore", `getDoc failed for ${collectionPath}/${docId}`, error);
      throw error;
    }
  } /*end secureGetDoc*/

  /**
   * Secure query fetch for Firestore collections.
   */
  async function secureGetDocs(
    queryRef: ReturnType<typeof query>,
  ): Promise<QuerySnapshot<DocumentData> | null> {
    try {
      const snapshot = await getDocs(queryRef);
      logger.info("Firestore", "getDocs query executed", {
        count: snapshot.docs.length,
        empty: snapshot.empty,
      });
      return snapshot as QuerySnapshot<DocumentData>;
    } catch (error) {
      logger.error("Firestore", "getDocs query failed", error);
      throw error;
    }
  } /*end secureGetDocs*/

  /**
   * Secure write/set of a Firestore document.
   */
  async function secureSetDoc(
    collectionPath: string,
    docId: string,
    data: DocumentData,
    merge = true,
  ): Promise<boolean> {
    try {
      const dRef = doc(db, collectionPath, docId);
      await setDoc(dRef, data, { merge });
      logger.success("Firestore", `setDoc: ${collectionPath}/${docId}`, {
        fields: Object.keys(data),
      });
      return true;
    } catch (error) {
      logger.error("Firestore", `setDoc failed for ${collectionPath}/${docId}`, error);
      throw error;
    }
  } /*end secureSetDoc*/

  /**
   * Secure update of an existing Firestore document.
   */
  async function secureUpdateDoc(
    collectionPath: string,
    docId: string,
    data: DocumentData,
  ): Promise<boolean> {
    try {
      const dRef = doc(db, collectionPath, docId);
      await updateDoc(dRef, data);
      logger.success("Firestore", `updateDoc: ${collectionPath}/${docId}`, {
        fields: Object.keys(data),
      });
      return true;
    } catch (error) {
      logger.error("Firestore", `updateDoc failed for ${collectionPath}/${docId}`, error);
      throw error;
    }
  } /*end secureUpdateDoc*/

  /**
   * Secure add of a document to a collection.
   */
  async function secureAddDoc(collectionPath: string, data: DocumentData): Promise<string> {
    try {
      const cRef = collection(db, collectionPath);
      const res = await addDoc(cRef, data);
      logger.success("Firestore", `addDoc to ${collectionPath}`, { id: res.id });
      return res.id;
    } catch (error) {
      logger.error("Firestore", `addDoc failed for ${collectionPath}`, error);
      throw error;
    }
  } /*end secureAddDoc*/

  /**
   * Secure delete of a Firestore document.
   */
  async function secureDeleteDoc(collectionPath: string, docId: string): Promise<boolean> {
    try {
      const dRef = doc(db, collectionPath, docId);
      await deleteDoc(dRef);
      logger.warn("Firestore", `deleteDoc: ${collectionPath}/${docId}`);
      return true;
    } catch (error) {
      logger.error("Firestore", `deleteDoc failed for ${collectionPath}/${docId}`, error);
      throw error;
    }
  } /*end secureDeleteDoc*/

  return {
    db,
    getDoc: secureGetDoc,
    getDocs: secureGetDocs,
    setDoc: secureSetDoc,
    updateDoc: secureUpdateDoc,
    addDoc: secureAddDoc,
    deleteDoc: secureDeleteDoc,
    query,
    where,
    orderBy,
    limit,
    collection: (path: string) => collection(db, path),
    doc: (path: string, id: string) => doc(db, path, id),
  };
}

export default useSecureFirestore;
