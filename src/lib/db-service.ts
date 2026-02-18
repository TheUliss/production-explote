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
const LOCAL_PROFILES_KEY = "excel-insights-local-profiles";

// Helper to check if Firebase is properly configured
const isCloudEnabled = () => {
    const config = (db as any)._app?._options || {};
    return config.apiKey && config.apiKey !== "YOUR_API_KEY";
};

export const dbService = {
    // Save a view profile
    async saveProfile(name: string, selectedColumns: string[]) {
        const id = name.toLowerCase().replace(/\s+/g, '-');
        const profileData: ViewProfile = {
            id,
            name,
            selectedColumns,
            createdAt: new Date().toISOString()
        };

        // Always save to LocalStorage for instant access/fallback
        const localProfiles = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');
        const updatedLocal = localProfiles.filter((p: any) => p.id !== id);
        updatedLocal.push(profileData);
        localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(updatedLocal));

        if (!isCloudEnabled()) return id;

        try {
            const profileRef = doc(db, PROFILES_COLLECTION, id);
            await setDoc(profileRef, {
                ...profileData,
                createdAt: Timestamp.now()
            });
            return id;
        } catch (error) {
            console.error("Error saving profile to cloud:", error);
            return id; // Return ID anyway since it's in LocalStorage
        }
    },

    // Load all profiles
    async getProfiles() {
        const localProfiles = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');

        if (!isCloudEnabled()) return localProfiles;

        try {
            const q = query(collection(db, PROFILES_COLLECTION));
            const querySnapshot = await getDocs(q);
            const cloudProfiles = querySnapshot.docs.map(doc => doc.data() as ViewProfile);

            // Merge local and cloud (cloud wins for same ID)
            const merged = [...localProfiles];
            cloudProfiles.forEach(cp => {
                const idx = merged.findIndex(lp => lp.id === cp.id);
                if (idx > -1) merged[idx] = cp;
                else merged.push(cp);
            });
            return merged;
        } catch (error) {
            console.error("Error fetching cloud profiles:", error);
            return localProfiles;
        }
    },

    // Delete a profile
    async deleteProfile(id: string) {
        // Local delete
        const localProfiles = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || '[]');
        localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(localProfiles.filter((p: any) => p.id !== id)));

        if (!isCloudEnabled()) return;

        try {
            await deleteDoc(doc(db, PROFILES_COLLECTION, id));
        } catch (error) {
            console.error("Error deleting cloud profile:", error);
        }
    },

    // Save full project data for collaboration
    async saveProjectData(fileName: string, data: any[], config: any, packedSerials?: any[]) {
        if (!isCloudEnabled()) throw new Error("Cloud Sync requires Firebase configuration.");
        try {
            const id = "current-project";
            const projectRef = doc(db, "projects", id);
            await setDoc(projectRef, {
                fileName,
                data,
                config,
                packedSerials: packedSerials || [],
                updatedAt: Timestamp.now()
            });
            return id;
        } catch (error) {
            console.error("Error saving project data:", error);
            throw error;
        }
    },

    // Load project data (legacy — kept for backward compatibility)
    async getProjectData() {
        if (!isCloudEnabled()) return null;
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
    },

    // Save only config + metadata (no raw data) to avoid 1MB Firestore limit.
    // Raw file data is persisted in localStorage by the caller.
    async saveProjectConfig(fileName: string, config: any, packedSerials?: [string, string][]) {
        const LOCAL_CONFIG_KEY = "prod-extractor-cloud-config";
        const configData = { fileName, config, packedSerials: packedSerials || [], updatedAt: new Date().toISOString() };

        // Always save locally as fallback
        localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(configData));

        if (!isCloudEnabled()) return;

        try {
            const configRef = doc(db, "projects", "current-config");
            await setDoc(configRef, {
                ...configData,
                updatedAt: Timestamp.now(),
            });
        } catch (error) {
            console.error("Error saving project config to cloud:", error);
            throw error;
        }
    },

    // Load config + metadata from Firestore (or localStorage fallback).
    async getProjectConfig() {
        const LOCAL_CONFIG_KEY = "prod-extractor-cloud-config";

        if (!isCloudEnabled()) {
            const local = localStorage.getItem(LOCAL_CONFIG_KEY);
            return local ? JSON.parse(local) : null;
        }

        try {
            const docRef = doc(db, "projects", "current-config");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data();
            }
            // Fallback to localStorage
            const local = localStorage.getItem(LOCAL_CONFIG_KEY);
            return local ? JSON.parse(local) : null;
        } catch (error) {
            console.error("Error loading project config:", error);
            const local = localStorage.getItem(LOCAL_CONFIG_KEY);
            return local ? JSON.parse(local) : null;
        }
    },
};
