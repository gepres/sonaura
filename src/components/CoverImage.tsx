import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

export type CoverImageProps = {
  uri: string;
  style: StyleProp<ImageStyle>;
  recyclingKey?: string;
  blurRadius?: number;
};

export function CoverImage({ uri, style, recyclingKey, blurRadius }: CoverImageProps) {
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="cover"
      transition={200}
      cachePolicy="disk"
      recyclingKey={recyclingKey}
      blurRadius={blurRadius}
    />
  );
}
