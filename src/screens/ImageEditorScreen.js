import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    TextInput,
    PanResponder,
    ScrollView,
    Alert,
    ActivityIndicator,
    Modal,
    Platform,
    Animated,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import ImagePicker from 'react-native-image-crop-picker';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_W - 32; // square canvas with 16px padding each side

// ─── Filter presets (pure JS overlays — no native module needed) ────
// Each filter uses multiple stacked color overlays to create a visible effect
const FILTERS = [
    {
        id: 'none',
        label: 'Original',
        layers: [],
        imageOpacity: 1,
    },
    {
        id: 'grayscale',
        label: 'B&W',
        // Layer gray tones at high opacity to heavily desaturate
        layers: [
            { color: 'rgba(100, 100, 100, 0.65)' },
            { color: 'rgba(50, 50, 50, 0.15)' },
        ],
        imageOpacity: 0.9,
    },
    {
        id: 'warm',
        label: 'Warm',
        layers: [
            { color: 'rgba(255, 140, 0, 0.30)' },
            { color: 'rgba(255, 80, 0, 0.08)' },
        ],
        imageOpacity: 1,
    },
    {
        id: 'cool',
        label: 'Cool',
        layers: [
            { color: 'rgba(0, 80, 220, 0.30)' },
            { color: 'rgba(0, 180, 255, 0.10)' },
        ],
        imageOpacity: 1,
    },
    {
        id: 'vintage',
        label: 'Vintage',
        layers: [
            { color: 'rgba(160, 120, 50, 0.35)' },
            { color: 'rgba(80, 60, 20, 0.15)' },
        ],
        imageOpacity: 0.92,
    },
    {
        id: 'dark',
        label: 'Dark',
        layers: [
            { color: 'rgba(0, 0, 0, 0.45)' },
        ],
        imageOpacity: 0.95,
    },
    {
        id: 'bright',
        label: 'Bright',
        layers: [
            { color: 'rgba(255, 255, 255, 0.28)' },
            { color: 'rgba(255, 255, 200, 0.08)' },
        ],
        imageOpacity: 1,
    },
];

export default function ImageEditorScreen({ imagePath, onSave, onCancel }) {
    // ─── State ─────────────────────────────────────────────────────
    const [currentPath, setCurrentPath] = useState(imagePath);
    const [rotation, setRotation] = useState(0);
    const [activeFilter, setActiveFilter] = useState('none');
    const [watermarkText, setWatermarkText] = useState('');
    const [showWatermarkInput, setShowWatermarkInput] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('rotate'); // rotate | filter | watermark

    const viewShotRef = useRef(null);

    // ─── Watermark drag (native-driven for 60fps smoothness) ────
    const pan = useRef(new Animated.ValueXY({ x: CANVAS_SIZE / 2 - 60, y: CANVAS_SIZE / 2 - 12 })).current;

    const watermarkPanResponder = useMemo(() =>
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
            onPanResponderGrant: () => {
                // Record the current offset so the next drag starts from here
                pan.setOffset({
                    x: pan.x._value,
                    y: pan.y._value,
                });
                pan.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event(
                [null, { dx: pan.x, dy: pan.y }],
                { useNativeDriver: false }
            ),
            onPanResponderRelease: () => {
                pan.flattenOffset();
                // Clamp within canvas bounds
                const clampedX = Math.max(0, Math.min(CANVAS_SIZE - 120, pan.x._value));
                const clampedY = Math.max(0, Math.min(CANVAS_SIZE - 30, pan.y._value));
                pan.setValue({ x: clampedX, y: clampedY });
            },
        }),
    [pan]);

    // ─── Actions ───────────────────────────────────────────────────
    const handleRotate = () => {
        setRotation((prev) => (prev + 90) % 360);
    };

    const handleCrop = async () => {
        try {
            const result = await ImagePicker.openCropper({
                path: currentPath,
                width: 1200,
                height: 1200,
                freeStyleCropEnabled: true,
                cropperToolbarTitle: 'Crop Image',
            });
            setCurrentPath(result.path);
        } catch (err) {
            if (err.code !== 'E_PICKER_CANCELLED') {
                console.error(err);
                Alert.alert('Error', 'Cropping failed.');
            }
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const uri = await viewShotRef.current.capture();
            onSave(uri);
        } catch (err) {
            console.error(err);
            Alert.alert('Error', 'Could not save edited image.');
        } finally {
            setSaving(false);
        }
    };

    const addWatermark = () => {
        setShowWatermarkInput(true);
    };

    const confirmWatermark = (text) => {
        setWatermarkText(text);
        setShowWatermarkInput(false);
    };

    const removeWatermark = () => {
        setWatermarkText('');
    };

    // ─── Filter helpers ────────────────────────────────────────────
    const getActiveFilter = () => FILTERS.find((f) => f.id === activeFilter) || FILTERS[0];

    // Renders filter overlay layers on top of the image
    const renderFilterLayers = (filterObj) => {
        if (!filterObj || !filterObj.layers || filterObj.layers.length === 0) return null;
        return filterObj.layers.map((layer, i) => (
            <View
                key={i}
                style={[StyleSheet.absoluteFill, { backgroundColor: layer.color }]}
                pointerEvents="none"
            />
        ));
    };

    // ─── Render ────────────────────────────────────────────────────
    const currentFilter = getActiveFilter();

    return (
        <View style={styles.container}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
                    <Text style={styles.headerBtnText}>✕ Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Edit Image</Text>
                <TouchableOpacity
                    onPress={handleSave}
                    style={[styles.headerBtn, styles.saveHeaderBtn]}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <Text style={styles.saveBtnText}>✓ Done</Text>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Canvas ── */}
                <View style={styles.canvasWrapper}>
                    <ViewShot
                        ref={viewShotRef}
                        options={{ format: 'png', quality: 1.0 }}
                        style={styles.canvas}
                    >
                        <Image
                            source={{ uri: currentPath }}
                            style={[
                                styles.canvasImage,
                                { transform: [{ rotate: `${rotation}deg` }] },
                                { opacity: currentFilter.imageOpacity },
                            ]}
                            resizeMode="contain"
                        />
                        {/* Filter overlay layers */}
                        {renderFilterLayers(currentFilter)}
                        {/* Watermark */}
                        {watermarkText !== '' && (
                            <Animated.View
                                style={[
                                    styles.watermarkContainer,
                                    {
                                        transform: pan.getTranslateTransform(),
                                    },
                                ]}
                                {...watermarkPanResponder.panHandlers}
                            >
                                <Text style={styles.watermarkText}>{watermarkText}</Text>
                            </Animated.View>
                        )}
                    </ViewShot>
                </View>

                {/* ── Tool Tabs ── */}
                <View style={styles.tabBar}>
                    {[
                        { id: 'rotate', icon: '🔄', label: 'Transform' },
                        { id: 'filter', icon: '🎨', label: 'Filters' },
                        { id: 'watermark', icon: '✍️', label: 'Watermark' },
                    ].map((tab) => (
                        <TouchableOpacity
                            key={tab.id}
                            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                            onPress={() => setActiveTab(tab.id)}
                        >
                            <Text style={styles.tabIcon}>{tab.icon}</Text>
                            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ── Tool Panels ── */}
                {activeTab === 'rotate' && (
                    <View style={styles.toolPanel}>
                        <TouchableOpacity style={styles.toolCard} onPress={handleRotate}>
                            <Text style={styles.toolCardIcon}>🔄</Text>
                            <Text style={styles.toolCardLabel}>Rotate 90°</Text>
                            <Text style={styles.toolCardSub}>Current: {rotation}°</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.toolCard} onPress={handleCrop}>
                            <Text style={styles.toolCardIcon}>✂️</Text>
                            <Text style={styles.toolCardLabel}>Crop</Text>
                            <Text style={styles.toolCardSub}>Free-form crop</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {activeTab === 'filter' && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterList}
                    >
                        {FILTERS.map((f) => {
                            const isActive = activeFilter === f.id;
                            return (
                                <TouchableOpacity
                                    key={f.id}
                                    style={[
                                        styles.filterChip,
                                        isActive && styles.filterChipActive,
                                    ]}
                                    onPress={() => setActiveFilter(f.id)}
                                >
                                    <View style={[
                                        styles.filterPreview,
                                        isActive && styles.filterPreviewActive,
                                    ]}>
                                        <Image
                                            source={{ uri: currentPath }}
                                            style={[
                                                styles.filterPreviewImg,
                                                { opacity: f.imageOpacity },
                                            ]}
                                            resizeMode="cover"
                                        />
                                        {/* Overlay layers for preview thumbnail */}
                                        {f.layers.map((layer, i) => (
                                            <View
                                                key={i}
                                                style={[
                                                    StyleSheet.absoluteFill,
                                                    { backgroundColor: layer.color },
                                                ]}
                                                pointerEvents="none"
                                            />
                                        ))}
                                    </View>
                                    <Text
                                        style={[
                                            styles.filterChipText,
                                            isActive && styles.filterChipTextActive,
                                        ]}
                                    >
                                        {f.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}

                {activeTab === 'watermark' && (
                    <View style={styles.toolPanel}>
                        {watermarkText === '' ? (
                            <TouchableOpacity style={styles.toolCardWide} onPress={addWatermark}>
                                <Text style={styles.toolCardIcon}>✍️</Text>
                                <Text style={styles.toolCardLabel}>Add Text Watermark</Text>
                                <Text style={styles.toolCardSub}>
                                    Type text and drag to position
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.watermarkControls}>
                                <View style={styles.watermarkInfo}>
                                    <Text style={styles.watermarkInfoLabel}>
                                        "{watermarkText}"
                                    </Text>
                                    <Text style={styles.watermarkInfoSub}>
                                        Drag on the image to reposition
                                    </Text>
                                </View>
                                <View style={styles.watermarkBtns}>
                                    <TouchableOpacity
                                        style={styles.watermarkEditBtn}
                                        onPress={addWatermark}
                                    >
                                        <Text style={styles.watermarkEditBtnText}>Edit</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.watermarkRemoveBtn}
                                        onPress={removeWatermark}
                                    >
                                        <Text style={styles.watermarkRemoveBtnText}>Remove</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* ── Watermark text input modal ── */}
            <Modal
                visible={showWatermarkInput}
                transparent
                animationType="fade"
                onRequestClose={() => setShowWatermarkInput(false)}
            >
                <WatermarkInputModal
                    initialText={watermarkText}
                    onConfirm={confirmWatermark}
                    onCancel={() => setShowWatermarkInput(false)}
                />
            </Modal>
        </View>
    );
}

// ─── Watermark Input Modal ─────────────────────────────────────────
function WatermarkInputModal({ initialText, onConfirm, onCancel }) {
    const [text, setText] = useState(initialText);

    return (
        <View style={modalStyles.overlay}>
            <View style={modalStyles.box}>
                <View style={modalStyles.iconWrap}>
                    <Text style={modalStyles.iconEmoji}>✍️</Text>
                </View>
                <Text style={modalStyles.title}>Add Watermark</Text>
                <Text style={modalStyles.subtitle}>
                    Enter text to overlay on the image
                </Text>
                <TextInput
                    style={modalStyles.input}
                    placeholder="e.g. © My Company"
                    placeholderTextColor="#64748B"
                    value={text}
                    onChangeText={setText}
                    autoFocus
                    selectionColor="#3B82F6"
                />
                <View style={modalStyles.buttons}>
                    <TouchableOpacity style={modalStyles.cancelBtn} onPress={onCancel}>
                        <Text style={modalStyles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={modalStyles.confirmBtn}
                        onPress={() => text.trim() && onConfirm(text.trim())}
                    >
                        <Text style={modalStyles.confirmText}>Add</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },

    /* Header */
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    headerBtn: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    saveHeaderBtn: {
        backgroundColor: '#3B82F6',
    },
    headerBtnText: {
        color: '#94A3B8',
        fontSize: 14,
        fontWeight: '600',
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    headerTitle: {
        color: '#F1F5F9',
        fontSize: 17,
        fontWeight: '700',
    },

    /* Scroll */
    scrollArea: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },

    /* Canvas */
    canvasWrapper: {
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 16,
    },
    canvas: {
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        backgroundColor: '#1E293B',
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    canvasImage: {
        width: '100%',
        height: '100%',
    },
    watermarkContainer: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.45)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        borderStyle: 'dashed',
    },
    watermarkText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
    },

    /* Tabs */
    tabBar: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 16,
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 14,
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 10,
    },
    tabActive: {
        backgroundColor: 'rgba(59,130,246,0.15)',
    },
    tabIcon: {
        fontSize: 18,
        marginBottom: 3,
    },
    tabLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    tabLabelActive: {
        color: '#60A5FA',
    },

    /* Tool Panel */
    toolPanel: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 12,
    },
    toolCard: {
        flex: 1,
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 14,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    toolCardWide: {
        flex: 1,
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 14,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    toolCardIcon: {
        fontSize: 28,
        marginBottom: 8,
    },
    toolCardLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#E2E8F0',
        marginBottom: 4,
    },
    toolCardSub: {
        fontSize: 11,
        color: '#64748B',
    },

    /* Filters */
    filterList: {
        paddingHorizontal: 16,
        gap: 10,
    },
    filterChip: {
        alignItems: 'center',
        width: 72,
        marginRight: 4,
    },
    filterChipActive: {},
    filterPreview: {
        width: 64,
        height: 64,
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 6,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    filterPreviewActive: {
        borderColor: '#60A5FA',
    },
    filterPreviewImg: {
        width: '100%',
        height: '100%',
    },
    filterChipText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
    },
    filterChipTextActive: {
        color: '#60A5FA',
    },

    /* Watermark controls */
    watermarkControls: {
        flex: 1,
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 14,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    watermarkInfo: {
        marginBottom: 16,
    },
    watermarkInfoLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: '#E2E8F0',
        marginBottom: 4,
    },
    watermarkInfoSub: {
        fontSize: 12,
        color: '#64748B',
    },
    watermarkBtns: {
        flexDirection: 'row',
        gap: 10,
    },
    watermarkEditBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: 'rgba(59,130,246,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.25)',
    },
    watermarkEditBtnText: {
        color: '#60A5FA',
        fontSize: 14,
        fontWeight: '700',
    },
    watermarkRemoveBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.25)',
    },
    watermarkRemoveBtnText: {
        color: '#F87171',
        fontSize: 14,
        fontWeight: '700',
    },
});

// ─── Watermark Modal Styles ────────────────────────────────────────
const modalStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    box: {
        width: '88%',
        backgroundColor: '#1E293B',
        borderRadius: 20,
        padding: 28,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    iconWrap: {
        alignSelf: 'center',
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(59,130,246,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    iconEmoji: {
        fontSize: 26,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: '#F1F5F9',
        textAlign: 'center',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 24,
    },
    input: {
        backgroundColor: '#0F172A',
        borderWidth: 1.5,
        borderColor: 'rgba(59,130,246,0.25)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        fontSize: 16,
        color: '#E2E8F0',
        marginBottom: 24,
    },
    buttons: {
        flexDirection: 'row',
        gap: 10,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    cancelText: {
        fontSize: 15,
        color: '#94A3B8',
        fontWeight: '700',
    },
    confirmBtn: {
        flex: 1.5,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: '#3B82F6',
    },
    confirmText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
});
