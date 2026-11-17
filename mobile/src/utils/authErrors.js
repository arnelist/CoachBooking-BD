const MESSAGES = {
    "auth/invalid-email": "Invalid email address format.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use": "Email address is already in use.",
    "auth/weak-password": "Password is too weak. It should be at least 6 characters.",
    "auth/too-many-requests": "Too many requests. Please try again later.",
    "auth/network-request-failed": "Network error. Please check your internet connection.",
    "permission-denied": "You do not have permission to perform this action.",
    "unavailable": "Service is currently unavailable. Please try again later.",
}

export function authErrorMessage(error) {
    return MESSAGES[error?.code] ?? "An unknown error occurred. Please try again.";
}