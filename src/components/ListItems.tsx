import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Image, ImageResizeMode, StyleSheet, View } from 'react-native';
import AppText from './AppText';
import OffsetButton from './OffsetButton';

export type ListItemProps = {
  title: string;
  image?: string | number;
  placeholderIcon?: string;
  subtitle?: string;
  details?: string;
  metadata?: string;
  showArrow?: boolean;
  onPress: () => void;
  subtitleIcon?: string;
  detailsIcon?: string;
  metadataIcon?: string;
  imageResizeMode?: ImageResizeMode;
  buttonLabel?: string;
  buttonDisabled?: boolean;
  buttonLoading?: boolean;
  buttonRadius?: number;
  buttonBgColor?: string;            
  buttonBgColorActive?: string;     
  buttonBorderColor?: string;
  buttonBorderColorActive?: string;
  variant?: 'walking' | 'community' | 'clinic';
};

const darken = (hex: string, amt = 28) => {
  const n = (hex || '').replace('#', '');
  if (n.length !== 6) return hex || '#1F2937';
  const to = (i: number) => Math.max(0, parseInt(n.slice(i, i + 2), 16) - amt);
  const r = to(0), g = to(2), b = to(4);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
};

const ListItem = ({
  title,
  image,
  placeholderIcon = 'park',
  subtitle,
  details,
  metadata,
  showArrow = true,
  onPress,
  subtitleIcon = 'location-on',
  detailsIcon = 'access-time',
  metadataIcon = 'person',
  imageResizeMode = 'cover',
  buttonDisabled = false,
  buttonLoading = false,
  buttonRadius = 6,
  buttonBgColor = '#FED787',
  buttonBgColorActive,
  buttonBorderColor = '#1F2937',
  buttonBorderColorActive,
}: ListItemProps) => {
  const [textHeight, setTextHeight] = useState<number>(80);
  const hasMeasuredRef = useRef(false);

  const handleTextLayout = (event: any) => {
    if (hasMeasuredRef.current) return;
    const { height } = event.nativeEvent.layout;
    setTextHeight(Math.min(Math.max(80, height), 200));
    hasMeasuredRef.current = true;
  };

  useEffect(() => {
    hasMeasuredRef.current = false;
  }, [title, subtitle, details, metadata]);

  const resolvedActiveBorder = buttonBorderColorActive ?? darken(buttonBgColor, 36);
  const resolvedActiveBg = buttonBgColorActive ?? buttonBgColor;

  return (
    <View style={styles.container}>
      <OffsetButton
        onPress={onPress}
        disabled={buttonDisabled}
        loading={buttonLoading}
        radius={buttonRadius}
        bgColor={buttonBgColor}
        bgColorActive={resolvedActiveBg}        
        borderColor={buttonBorderColor}
        borderColorActive={resolvedActiveBorder}
        style={[styles.offsetButton, { backgroundColor: resolvedActiveBg }]}
        contentStyle={[
          styles.offsetButtonContent,
          { backgroundColor: buttonBgColor, borderColor: buttonBorderColor },
        ]}
      >
        <View style={styles.buttonInnerContent}>
          {/* Left image/icon */}
          <View style={styles.imageWrapper}>
            <View
              style={[
                styles.imageContainer,
                imageResizeMode === 'cover' ? { height: textHeight } : styles.centeredImageContainer,
              ]}
            >
              {image ? (
                typeof image === 'number' ? (
                  <Image
                    source={image}
                    style={[styles.image, imageResizeMode === 'cover' && { height: textHeight }]}
                    resizeMode={imageResizeMode}
                  />
                ) : (
                  <Image
                    source={{ uri: image }}
                    style={[styles.image, imageResizeMode === 'cover' && { height: textHeight }]}
                    resizeMode={imageResizeMode}
                  />
                )
              ) : (
                <View
                  style={[
                    styles.placeholder,
                    imageResizeMode === 'cover' ? { height: textHeight } : styles.centeredPlaceholder,
                  ]}
                >
                  <MaterialIcons name={placeholderIcon as any} size={32} color="#6C757D" />
                </View>
              )}
            </View>
          </View>

          {/* Right text content */}
          <View style={styles.content}>
            <View style={styles.textContent} onLayout={handleTextLayout}>
              <AppText variant="h2" weight="700" style={styles.title}>
                {title}
              </AppText>

              <View style={styles.infoContent}>
                {subtitle && (
                  <View style={styles.infoRow}>
                    <View style={styles.iconWrapper}>
                      <MaterialIcons name={subtitleIcon as any} size={16} color="#007AFF" />
                    </View>
                    <AppText variant="body" weight="600" style={styles.infoText}>
                      {subtitle}
                    </AppText>
                  </View>
                )}

                {details && (
                  <View style={styles.infoRow}>
                    <View style={styles.iconWrapper}>
                      <MaterialIcons name={detailsIcon as any} size={16} color="#28A745" />
                    </View>
                    <AppText variant="body" weight="600" style={styles.infoText}>
                      {details}
                    </AppText>
                  </View>
                )}

                {metadata && (
                  <View style={styles.infoRow}>
                    <View style={styles.iconWrapper}>
                      <MaterialIcons name={metadataIcon as any} size={16} color="#F59E0B" />
                    </View>
                    <AppText variant="body" weight="600" style={styles.infoText}>
                      {metadata}
                    </AppText>
                  </View>
                )}
              </View>
            </View>

            {showArrow && (
              <View style={styles.arrowContainer}>
                <MaterialIcons name="arrow-forward" size={18} color="#6C757D" />
              </View>
            )}
          </View>
        </View>
      </OffsetButton>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 16, marginHorizontal: 8 },
  offsetButton: {
    marginTop: 0,
    marginBottom: 0,
    overflow: 'visible',
  },
  offsetButtonContent: {
    padding: 16,
    borderWidth: 2,
  },
  buttonInnerContent: { flexDirection: 'row', width: '100%' },
  imageWrapper: { justifyContent: 'center', marginRight: 12 },
  imageContainer: { width: 80, borderRadius: 8, overflow: 'hidden' },
  centeredImageContainer: {
    width: 80, height: 80, borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center',
  },
  image: { width: '100%' },
  placeholder: {
    width: '100%', borderRadius: 8, backgroundColor: '#E9ECEF', justifyContent: 'center', alignItems: 'center',
  },
  centeredPlaceholder: {
    width: '100%', height: 80, borderRadius: 8, backgroundColor: '#E9ECEF', justifyContent: 'center', alignItems: 'center',
  },
  content: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  textContent: { flex: 1, marginRight: 8 },
  title: { fontSize: 20, color: '#2C3E50', flexWrap: 'wrap', marginBottom: 8 },
  infoContent: { gap: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', minHeight: 20 },
  iconWrapper: { height: 20, justifyContent: 'flex-start', alignItems: 'center', width: 20, paddingTop: 2 },
  infoText: { flex: 1, marginLeft: 4, lineHeight: 20, includeFontPadding: false, textAlignVertical: 'center' },
  arrowContainer: { justifyContent: 'center', alignItems: 'center', paddingLeft: 8 },
});

export default ListItem;
