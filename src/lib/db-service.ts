import { db } from "./firebase";
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    Timestamp,
    deleteDoc
} from "firebase/firestore";

export interface ViewProfile {
    id: string;
    name: string;
    selectedColumns: string[];
    createdAt: any;
}

const PROFILES_COLLECTION = "view_profiles";

export const dbService = {
    // Save a view profile
    async saveProfile(name: string, selectedColumns: string[]) {
        try {
            const id = name.toLowerCase().replace(/\s+/g, '-');
            const profileRef = doc(db, PROFILES_COLLECTION, id);
            const profileData: ViewProfile = {
                id,
                name,
                selectedColumns,
                createdAt: Timestamp.now()
            };
            await setDoc(profileRef, profileData);
            return id;
        } catch (error) {
            console.error("Error saving profile:", error);
            throw error;
        }
    },

    // Load all profiles
    async getProfiles() {
        try {
            const q = query(collection(db, PROFILES_COLLECTION));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => doc.data() as ViewProfile);
        } catch (error) {
            console.error("Error fetching profiles:", error);
            return [];
        }
    },

    // Delete a profile
    async deleteProfile(id: string) {
        try {
            await deleteDoc(doc(db, PROFILES_COLLECTION, id));
        } catch (error) {
            console.error("Error deleting profile:", error);
            throw error;
        }
    },

    // Save full project data for collaboration
    async saveProjectData(fileName: string, data: any[], selectedColumns: string[]) {
        try {
            const id = "current-project"; // For now using a single global project for simplicity
            const projectRef = doc(db, "projects", id);
            await setDoc(projectRef, {
                fileName,
                data,
                selectedColumns,
                updatedAt: Timestamp.now()
            });
            return id;
        } catch (error) {
            console.error("Error saving project data:", error);
            throw error;
        }
    },

    // Load project data
    async getProjectData() {
        try {
            const docRef = doc(db, "projects", "current-project");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data();
            }
            return null;
        } catch (error) {
            console.error("Error loading project data:", error);
            return null;
        }
    }
};
