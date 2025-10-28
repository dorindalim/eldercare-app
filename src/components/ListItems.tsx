// this creates the visual card for each park/clinic/cc
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Image, ImageResizeMode, StyleSheet, TouchableOpacity, View } from 'react-native';
import AppText from './AppText';

export type ListItemProps = {
  title: string;
  image?: string | number;
  placeholderIcon?: string;
  subtitle?: string;
  details?: string;
  metadata?: string;
  showArrow?: boolean;
  onPress: () => void;
  isSelected?: boolean;
  // Optional custom icons for different use cases
  subtitleIcon?: string;
  detailsIcon?: string;
  metadataIcon?: string;
  // New prop to control image resize behavior
  imageResizeMode?: ImageResizeMode;
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
  isSelected = false,
  subtitleIcon = 'location-on',
  detailsIcon = 'access-time',  
  metadataIcon = 'person',
  imageResizeMode = 'cover', // Default to cover (stretched for parks)
}: ListItemProps) => {
  const [textHeight, setTextHeight] = useState<number>(80);
  const hasMeasuredRef = useRef(false);

  const handleTextLayout = (event: any) => {
    if (hasMeasuredRef.current) return; // Only measure once
    
    const { height } = event.nativeEvent.layout;
    // Set a reasonable maximum height to prevent infinite growth
    const calculatedHeight = Math.min(Math.max(80, height), 200); // Min 80px, Max 200px
    setTextHeight(calculatedHeight);
    hasMeasuredRef.current = true;
  };

  // Reset measurement when content changes
  useEffect(() => {
    hasMeasuredRef.current = false;
  }, [title, subtitle, details, metadata]);

  return (
    <TouchableOpacity
      style={[styles.container, isSelected && styles.selected]}
      onPress={onPress}
    >
      {/* Image/Icon on the left */}
      <View style={styles.imageWrapper}>
        <View 
          style={[
            styles.imageContainer, 
            imageResizeMode === 'cover' 
              ? { height: textHeight } // For parks: stretch to text height
              : styles.centeredImageContainer // For CC: fixed height, centered
          ]}
        >
          {image ? (
            typeof image === 'number' ? (
              <Image 
                source={image} 
                style={[
                  styles.image,
                  imageResizeMode === 'cover' && { height: textHeight }
                ]} 
                resizeMode={imageResizeMode} 
              />
            ) : (
              <Image 
                source={{ uri: image }} 
                style={[
                  styles.image,
                  imageResizeMode === 'cover' && { height: textHeight }
                ]} 
                resizeMode={imageResizeMode} 
              />
            )
          ) : (
            <View style={[
              styles.placeholder,
              imageResizeMode === 'cover' 
                ? { height: textHeight } 
                : styles.centeredPlaceholder
            ]}>
              <MaterialIcons name={placeholderIcon as any} size={32} color="#6C757D" />
            </View>
          )}
        </View>
      </View>

      {/* Content on the right */}
      <View style={styles.content}>
        <View style={styles.textContent} onLayout={handleTextLayout}>
          {/* Title - using h2 variant for main container names */}
          <AppText variant="h2" weight="700" style={styles.title}>
            {title}
          </AppText>

          {/* All info rows - using body variant for rest of text */}
          <View style={styles.infoContent}>
            {subtitle && (
              <View style={styles.infoRow}>
                <MaterialIcons name={subtitleIcon as any} size={16} color="#007AFF" />
                <AppText variant="body" weight="600" style={styles.infoText}>
                  {subtitle}
                </AppText>
              </View>
            )}

            {details && (
              <View style={styles.infoRow}>
                <MaterialIcons name={detailsIcon as any} size={16} color="#28A745" />
                <AppText variant="body" weight="600" style={styles.infoText}>
                  {details}
                </AppText>
              </View>
            )}

            {metadata && (
              <View style={styles.infoRow}>
                <MaterialIcons name={metadataIcon as any} size={16} color="#F59E0B" />
                <AppText variant="body" weight="600" style={styles.infoText}>
                  {metadata}
                </AppText>
              </View>
            )}
          </View>
        </View>

        {/* Arrow */}
        {showArrow && (
          <View style={styles.arrowContainer}>
            <MaterialIcons name="arrow-forward" size={18} color="#6C757D" />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 120,
  },
  selected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
    marginBottom: 8,
  },
  // Wrapper to help with positioning
  imageWrapper: {
    justifyContent: 'center',
    marginRight: 12,
  },
  // Image container for parks (stretched)
  imageContainer: {
    width: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  // Image container for CC (centered, fixed height)
  centeredImageContainer: {
    width: 80,
    height: 80, // Fixed height for CC
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    // Height is set dynamically for parks, not for CC
  },
  placeholder: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredPlaceholder: {
    width: '100%',
    height: 80, // Fixed height for CC
    borderRadius: 8,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Content area with text and arrow
  content: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  // Text content area - this gets measured
  textContent: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 20,
    color: '#2C3E50',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  // Info content area
  infoContent: {
    gap: 6,
  },
  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  infoText: {
    flex: 1,
    marginLeft: 6,
    lineHeight: 20,
  },
  // Arrow container - centered vertically
  arrowContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 8,
  },
});

export default ListItem;