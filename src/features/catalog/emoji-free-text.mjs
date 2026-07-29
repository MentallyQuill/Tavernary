const emojiSequence =
  /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)(?:\p{Emoji_Modifier})?(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F?)(?:\p{Emoji_Modifier})?)*|\p{Emoji_Modifier})/gu;

export function stripEmoji(value) {
  const sanitized = value.replace(emojiSequence, "");
  return sanitized === value
    ? { value, removed: false }
    : { value: sanitized, removed: true };
}
