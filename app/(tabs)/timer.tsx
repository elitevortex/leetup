import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { Difficulty, DIFFICULTY_COLORS } from '../../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

export default function TimerScreen() {
  const { user } = useAuth();
  const [problemName, setProblemName] = useState('');
  const [problemNumber, setProblemNumber] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [submissions, setSubmissions] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startTimer = () => {
    if (!problemName.trim()) {
      Alert.alert('Hold on', 'Enter the problem name first');
      return;
    }
    setRunning(true);
    setElapsed(0);
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  const stopTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
  };

  const submitSolve = async () => {
    if (!user) return;
    if (elapsed === 0) {
      Alert.alert('Error', 'Start the timer first');
      return;
    }

    const { error } = await supabase.from('solves').insert({
      user_id: user.id,
      problem_name: problemName.trim(),
      problem_number: problemNumber ? parseInt(problemNumber, 10) : null,
      difficulty,
      time_seconds: elapsed,
      submissions,
    });

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    Alert.alert('Nice!', `Solved "${problemName}" in ${formatTime(elapsed)}`);
    setProblemName('');
    setProblemNumber('');
    setDifficulty('Medium');
    setElapsed(0);
    setSubmissions(1);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Problem Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Problem</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Two Sum"
          placeholderTextColor={Colors.textMuted}
          value={problemName}
          onChangeText={setProblemName}
          editable={!running}
        />
        <TextInput
          style={[styles.input, { marginTop: Spacing.sm }]}
          placeholder="Problem # (optional)"
          placeholderTextColor={Colors.textMuted}
          value={problemNumber}
          onChangeText={setProblemNumber}
          keyboardType="number-pad"
          editable={!running}
        />
      </View>

      {/* Difficulty Selector */}
      <View style={styles.section}>
        <Text style={styles.label}>Difficulty</Text>
        <View style={styles.difficultyRow}>
          {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map((d) => (
            <TouchableOpacity
              key={d}
              style={[
                styles.difficultyButton,
                difficulty === d && {
                  backgroundColor: DIFFICULTY_COLORS[d],
                  borderColor: DIFFICULTY_COLORS[d],
                },
              ]}
              onPress={() => !running && setDifficulty(d)}
              disabled={running}
            >
              <Text
                style={[
                  styles.difficultyText,
                  difficulty === d && { color: Colors.background },
                ]}
              >
                {d}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Timer Display */}
      <View style={styles.timerContainer}>
        <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
        <Text style={styles.timerSubtext}>
          {running ? 'Solving...' : elapsed > 0 ? 'Stopped' : 'Ready'}
        </Text>
      </View>

      {/* Timer Controls */}
      <View style={styles.controls}>
        {!running && elapsed === 0 && (
          <TouchableOpacity style={styles.startButton} onPress={startTimer}>
            <Text style={styles.startButtonText}>Start Timer</Text>
          </TouchableOpacity>
        )}
        {running && (
          <TouchableOpacity style={styles.stopButton} onPress={stopTimer}>
            <Text style={styles.stopButtonText}>Stop — Solved!</Text>
          </TouchableOpacity>
        )}
        {!running && elapsed > 0 && (
          <View style={styles.postSolveControls}>
            {/* Submissions Counter */}
            <View style={styles.submissionsRow}>
              <Text style={styles.label}>Submissions</Text>
              <View style={styles.counter}>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => setSubmissions(Math.max(1, submissions - 1))}
                >
                  <Text style={styles.counterButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.counterValue}>{submissions}</Text>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => setSubmissions(submissions + 1)}
                >
                  <Text style={styles.counterButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={submitSolve}>
              <Text style={styles.submitButtonText}>Post Solve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => {
                setElapsed(0);
                setSubmissions(1);
              }}
            >
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  difficultyButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  difficultyText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  timerContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  timerText: {
    fontSize: 72,
    fontWeight: '200',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  timerSubtext: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
  },
  controls: {
    gap: Spacing.md,
  },
  startButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  startButtonText: {
    color: Colors.background,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  stopButton: {
    backgroundColor: Colors.danger,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  postSolveControls: {
    gap: Spacing.md,
  },
  submissionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  counterButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterButtonText: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  counterValue: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  submitButtonText: {
    color: Colors.background,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  resetButton: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  resetButtonText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
});
