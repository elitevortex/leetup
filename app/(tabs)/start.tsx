import { Redirect } from 'expo-router';

// Never shown: the tab bar's centre button pushes /timer directly
export default function Start() {
  return <Redirect href="/timer" />;
}
