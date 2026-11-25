import NetInfo from "@react-native-community/netinfo";

export const OFFLINE_MESSAGE = "No internet connection. Please try again when you are online.";

//Firestore keeps offline writes in a queue and waits, so the connection is checked before writing
export async function isOnline() {
    const state = await NetInfo.fetch();
    //null - not known yet, then the write is allowed
    return state.isConnected !== false && state.isInternetReachable !== false;
}