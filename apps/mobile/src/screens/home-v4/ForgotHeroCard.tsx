import { useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { HomeV4Icon } from "./homeV4Icons";
import { heebo, V4 } from "./homeV4Theme";

const HERO = require("../../../assets/home-v4/hero-background.png");

export function ForgotHeroCard({
  scale,
  value,
  onChangeText,
  onSend,
  onMic,
  onOpenForgot,
  sending,
  recording,
  error,
}: {
  scale: number;
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onMic: () => void;
  onOpenForgot: () => void;
  sending: boolean;
  recording: boolean;
  error: string;
}) {
  const s = scale;
  const [focused, setFocused] = useState(false);
  return (
    <ImageBackground
      source={HERO}
      resizeMode="cover"
      style={[
        styles.card,
        {
          marginHorizontal: 16 * s,
          height: 152 * s,
          borderRadius: 28 * s,
        },
      ]}
      imageStyle={{ borderRadius: 28 * s }}
    >
      <View style={[styles.copy, { top: 12 * s, right: 16 * s, left: 118 * s }]}>
        <Pressable onPress={onOpenForgot} accessibilityLabel="מה שכחתי?">
        <Text
          style={{
            fontFamily: heebo("700"),
            fontSize: 26 * s,
            lineHeight: 32 * s,
            color: V4.text,
            textAlign: "right",
          }}
        >
          מה שכחתי?
        </Text>
        </Pressable>
        <Text
          style={{
            fontFamily: heebo("400"),
            fontSize: 12 * s,
            lineHeight: 16 * s,
            color: V4.muted,
            textAlign: "right",
            marginTop: 4 * s,
          }}
        >
          נסרוק יחד מה פתוח ומה דורש תשומת לב
        </Text>
      </View>
      <View
        style={[
          styles.composer,
          {
            left: 102 * s,
            right: 14 * s,
            bottom: 14 * s,
            height: 44 * s,
            borderRadius: 22 * s,
            borderColor: focused ? V4.sageSoft : V4.border,
          },
        ]}
      >
        <Pressable
          onPress={onMic}
          accessibilityLabel={recording ? "עצור הקלטה" : "הקלטה"}
          style={[
            styles.mic,
            {
              width: 32 * s,
              height: 32 * s,
              borderRadius: 16 * s,
              backgroundColor: recording ? "#C45C4A" : V4.sage,
              marginStart: 6 * s,
            },
          ]}
        >
          <HomeV4Icon name="mic" size={16 * s} color="#FFFFFF" />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="כתבי או הקליטי משהו..."
          placeholderTextColor={V4.placeholder}
          style={{
            flex: 1,
            fontFamily: heebo("400"),
            fontSize: 13 * s,
            color: V4.text,
            textAlign: "right",
            paddingHorizontal: 10 * s,
          }}
          textAlign="right"
          returnKeyType="send"
          onSubmitEditing={onSend}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!sending}
        />
        {sending ? <ActivityIndicator color={V4.sage} style={{ marginEnd: 10 * s }} /> : null}
      </View>
      {error ? (
        <Pressable onPress={onSend} style={[styles.retry, { right: 18 * s, bottom: 62 * s }]}>
          <Text style={{ fontFamily: heebo("500"), fontSize: 11 * s, color: "#8B2E1F" }}>{error} · נסי שוב</Text>
        </Pressable>
      ) : null}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", backgroundColor: V4.heroWash },
  copy: { position: "absolute" },
  composer: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: V4.composer,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mic: { alignItems: "center", justifyContent: "center" },
  retry: { position: "absolute" },
});
