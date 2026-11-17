import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, ScrollView } from 'react-native';
import { usePreventRemove } from "@react-navigation/native";
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { collection, doc, getDocs, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { authErrorMessage } from '../utils/authErrors';
import { formatName } from '../utils/format';
import { parsePriceToCents } from '../utils/price';
import StepProgress from "../components/StepProgress";
import * as DocumentPicker from "expo-document-picker";
import { uploadTrainerCv, deleteFile } from "../services/storage";
import Select from "../components/Select";

const STEPS = ["Account Info", "About", "Location & Price"];
const ACCOUNT_ERRORS = ["auth/email-already-in-use", "auth/invalid-email", "auth/weak-password"];
const MAX_CV_SIZE = 5 * 1024 * 1024;

export default function TrainerRegisterScreen({ navigation }) {
  const [step, setStep] = useState(0);

  //Step 1: Account Info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  //Step 2: About
  const [specialization, setSpecialization] = useState('');
  const [education, setEducation] = useState('');
  const [description, setDescription] = useState('');
  const [cv, setCv] = useState(null); // { uri, name, size }

  //Step 3: Location & Price
  const [price, setPrice] = useState('');
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [locationsLoading, setLocationsLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  //Load locations for step 3
  useEffect(() => {
      async function loadLocations() {
        try {
          const q = query(collection(db, 'locations'), where('active', '==', true));
          const snap = await getDocs(q);
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order);
          setLocations(list);
        } catch (e) {
            setError(authErrorMessage(e));
        } finally {
            setLocationsLoading(false);
        }
      }
      loadLocations();
  }, []);

  //Back button to go to previous step
  usePreventRemove(step > 0 && !loading, () => handleBack());

  //Error text or null
  function validateStep(s) {
    if (s === 0) {
      if (!firstName.trim() || !lastName.trim() || !email.trim()) return 'Please fill in all fields';
      if (password.length < 6) return 'Password must be at least 6 characters long';
      if (password !== password2) return 'Passwords do not match';
    }
    if (s === 1) if (!specialization.trim() || !education.trim()) return 'Please specify your specialization and education';
    if (s === 2) {
      if (parsePriceToCents(price) === null) return 'Please enter a valid price';
      if (!locationId) return 'Please select a location';
    }
    return null;
  }

  function handleNext() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError('');
    if (step < STEPS.length - 1) setStep(step + 1); 
    else handleRegister();
  }

  function handleBack() {
    setError('');
    setStep((s) => Math.max(0, s -1));
  }

  async function pickCv() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const file = result.assets[0];
    if (file.size && file.size > MAX_CV_SIZE) {
      setError("File too large. Maximum size: 5 MB.")
      return;
    }
    setError("");
    setCv(file);
  }

  async function handleRegister() {
    setLoading(true);
    let cred = null;
    let cvPath = null;

    try {
      cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;

      if (cv) {
        cvPath = await uploadTrainerCv(uid, cv);
      }

      const first = formatName(firstName);
      const last = formatName(lastName);
      const now = serverTimestamp();

      //Both docs saved together or none at all
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), {
        firstName: first,
        lastName: last,
        email: cred.user.email,
        role: 'trainer',
        createdAt: now,
        updatedAt: now,
      });
      batch.set(doc(db, 'trainers', uid), {
        firstName: first,
        lastName: last,
        email: cred.user.email,
        specialization: specialization.trim(),
        priceCents: parsePriceToCents(price),
        education: education.trim(),
        cvPath,
        cvName: cv?.name ?? null,
        description: description.trim(),
        locationId,
        status: 'pending',
        rejectionReason: null,
        active: true,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await batch.commit();
    } catch (e) {
        if (cvPath) await deleteFile(cvPath).catch(() => {});
        if (cred) await deleteUser(cred.user).catch(() => {});
        if (ACCOUNT_ERRORS.includes(e.code)) setStep(0);
        setError(authErrorMessage(e));
    } finally {
        setLoading(false);
    }
  }

  return (
      <KeyboardAvoidingView
          style={ { flex: 1 } }
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Trainer Registration</Text>
          <StepProgress steps={STEPS} current={step} />

          {step === 0 && (
            <>
              <TextInput
                  style={styles.input}
                  placeholder="First Name..."
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  autoComplete="given-name"
              />
              <TextInput
                  style={styles.input}
                  placeholder="Last Name..."
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  autoComplete="family-name"
              />
              <TextInput
                  style={styles.input}
                  placeholder="example@email.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
              />
              <TextInput
                  style={styles.input}
                  placeholder="Password..."
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
              />
              <TextInput
                  style={styles.input}
                  placeholder="Confirm Password..."
                  value={password2}
                  onChangeText={setPassword2}
                  secureTextEntry
                  autoComplete="new-password"
              />
            </>
          )}

          {step === 1 && (
            <>
              <TextInput
                  style={styles.input}
                  placeholder="Specialization (ex. Strength Training, Yoga, etc.)"
                  value={specialization}
                  onChangeText={setSpecialization}
              />
              <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="Education & Qualifications"
                  value={education}
                  onChangeText={setEducation}
                  multiline
              />
              <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="Description (optional)"
                  value={description}
                  onChangeText={setDescription}
                  multiline
              />
              <Text style={styles.label}>CV (optional, PDF up to 5 MB)</Text>
              {cv ? (
                <View style={styles.fileRow}>
                  <Text style={styles.fileName} numberOfLines={1}>{cv.name}</Text>
                  <Pressable onPress={() => setCv(null)}>
                    <Text style={styles.link}>Remove</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.fileButton} onPress={pickCv}>
                  <Text style={styles.buttonSecondaryText}>Upload CV</Text>
                </Pressable>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <TextInput
                  style={styles.input}
                  placeholder="Price per session (EUR)"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
              />
              <Select
                label="Location"
                placeholder="Select a location"
                loading={locationsLoading}
                emptyText="No active locations available"
                value={locationId}
                onChange={setLocationId}
                options={locations.map((loc) => ({
                  value: loc.id,
                  label: loc.name,
                  description: loc.address,
                }))}
              />
            </>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.buttonRow}>
            <Pressable 
              style={[styles.button, styles.buttonSecondary, step === 0 && { opacity: 0.4 }]} 
              onPress={handleBack} 
              disabled={step === 0 || loading}
            >
              <Text style={styles.buttonSecondaryText}>Previous</Text>
            </Pressable>
            <Pressable 
              style={[styles.button, styles.buttonPrimary]} 
              onPress={handleNext}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" /> 
                ) : ( 
                <Text style={styles.buttonText}>
                  {step < STEPS.length - 1 ? 'Next' : 'Register'}
                </Text>
              )}
            </Pressable>
          </View>

          {step === 0 && (
            <Pressable onPress={() => navigation.popTo('Login')}>
              <Text style={styles.link}>Already have an account? Log In</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:
  { 
      flexGrow: 1, 
      justifyContent: "center", 
      padding: 24, 
      gap: 12 
  },
  title: 
  { 
      fontSize: 28, 
      fontWeight: "700", 
      textAlign: "center", 
      marginBottom: 16 
  },
  input: 
  { 
      borderWidth: 1, 
      borderColor: "#ccc", 
      borderRadius: 8, 
      padding: 12, 
      fontSize: 16 
  },
  error: { color: "#dc2626" },
  buttonRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: { backgroundColor: "#111827" },
  buttonSecondary: { backgroundColor: "#fff" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonSecondaryText: { color: "#111827", fontWeight: "600", fontSize: 16 },
  link: 
  { 
    textAlign: "center", 
    color: "#2563eb", 
    marginTop: 8 
  },
  fileButton: {
  borderWidth: 1,
  borderStyle: "dashed",
  borderColor: "#111827",
  borderRadius: 8,
  padding: 14,
  alignItems: "center",
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
  },
  fileName: { flex: 1 },
});