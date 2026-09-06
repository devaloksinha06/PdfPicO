import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Image,
    FlatList,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Share,
    Platform,
    PermissionsAndroid,
    Modal,
    TextInput,
    Animated,
    Dimensions,
    ScrollView,
    PanResponder,
    Linking,
    KeyboardAvoidingView,
} from 'react-native';
import ImagePicker from 'react-native-image-crop-picker';
import VersionCheck from 'react-native-version-check';
import RNShare from 'react-native-share';
import FileViewer from 'react-native-file-viewer';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { convertImagesToPDF } from '../utils/pdfHelper';
import ImageEditorScreen from './ImageEditorScreen';
import { DocumentDirectoryPath, exists as fsExists, readFile, writeFile, unlink } from '@dr.pogodin/react-native-fs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMB_SIZE = (SCREEN_WIDTH - 80) / 3;
const HISTORY_FILE = `${DocumentDirectoryPath}/pdf_history.json`;

export default function HomeScreen() {
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pdfPath, setPdfPath] = useState(null);
    const [showNameModal, setShowNameModal] = useState(false);
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [pdfFileName, setPdfFileName] = useState('');
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // Editor state
    const [editingIndex, setEditingIndex] = useState(null);

    // Reorder state
    const [reorderMode, setReorderMode] = useState(false);
    const [dragIndex, setDragIndex] = useState(null);

    // About modal state
    // About modal state
    const [showAboutModal, setShowAboutModal] = useState(false);

    // History state
    const [pdfHistory, setPdfHistory] = useState([]);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const hasHistory = await fsExists(HISTORY_FILE);
            if (hasHistory) {
                const content = await readFile(HISTORY_FILE, 'utf8');
                setPdfHistory(JSON.parse(content));
            }
        } catch (error) {
            console.log('Error loading history', error);
        }
    };

    const saveToHistory = async (pdfItem) => {
        try {
            let newHistory = [pdfItem, ...pdfHistory];
            if (newHistory.length > 10) {
                newHistory = newHistory.slice(0, 10);
            }
            setPdfHistory(newHistory);
            await writeFile(HISTORY_FILE, JSON.stringify(newHistory), 'utf8');
        } catch (error) {
            console.log('Error saving history', error);
        }
    };

    const deleteFromHistory = (itemId, itemPath) => {
        Alert.alert(
            'Delete PDF',
            'Remove this PDF from history? The file will also be deleted from your device.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const newHistory = pdfHistory.filter(h => h.id !== itemId);
                            setPdfHistory(newHistory);
                            await writeFile(HISTORY_FILE, JSON.stringify(newHistory), 'utf8');
                            // Try to delete the actual PDF file
                            const fileExists = await fsExists(itemPath);
                            if (fileExists) {
                                await unlink(itemPath);
                            }
                        } catch (error) {
                            console.log('Error deleting history item', error);
                        }
                    },
                },
            ],
        );
    };

    // ─── Permissions ───────────────────────────────────────────────
    const requestStoragePermission = async () => {
        if (Platform.OS !== 'android') return true;
        try {
            const permission =
                Platform.Version >= 33
                    ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
                    : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
            const granted = await PermissionsAndroid.request(permission);
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch (err) {
            console.warn(err);
            return false;
        }
    };

    const requestWritePermission = async () => {
        if (Platform.OS !== 'android') return true;
        if (Platform.Version >= 29) return true;
        try {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch (err) {
            console.warn(err);
            return false;
        }
    };

    // ─── Actions ───────────────────────────────────────────────────
    const pickImages = async () => {
        const hasPermission = await requestStoragePermission();
        if (!hasPermission) {
            Alert.alert('Permission needed', 'Storage access is required to pick images.');
            return;
        }

        if (images.length >= 30) {
            Alert.alert('Limit Reached', 'You can only select up to 30 images maximum.');
            return;
        }

        try {
            const picked = await ImagePicker.openPicker({
                multiple: true,
                maxFiles: 30 - images.length,
                mediaType: 'photo',
                cropping: false,
                compressImageQuality: 0.6,
                compressImageMaxWidth: 1600,
                compressImageMaxHeight: 1600,
            });

            const formatted = picked.map((img) => ({ path: img.path }));

            setImages((prev) => {
                const combined = [...prev, ...formatted];
                if (combined.length > 30) {
                    Alert.alert('Limit Reached', 'You can only add up to 30 images. Extra images were ignored.');
                    return combined.slice(0, 30);
                }
                return combined;
            });
            setPdfPath(null);
        } catch (err) {
            if (err.code !== 'E_PICKER_CANCELLED') {
                console.error(err);
                Alert.alert('Error', 'Could not pick images.');
            }
        }
    };

    const scanDocument = async () => {
        if (images.length >= 30) {
            Alert.alert('Limit Reached', 'You can only add up to 30 images maximum.');
            return;
        }

        try {
            const { scannedImages } = await DocumentScanner.scanDocument({
                maxNumDocuments: 30 - images.length,
            });
            if (scannedImages && scannedImages.length > 0) {
                const formatted = scannedImages.map((imgPath) => ({ path: imgPath }));
                setImages((prev) => {
                    const combined = [...prev, ...formatted];
                    if (combined.length > 30) {
                        Alert.alert('Limit Reached', 'You can only add up to 30 images. Extra images were ignored.');
                        return combined.slice(0, 30);
                    }
                    return combined;
                });
                setPdfPath(null);
            }
        } catch (error) {
            console.error('Scan Error:', error);
            Alert.alert('Error', 'Could not scan document.');
        }
    };


    const removeImage = (index) => {
        setImages((prev) => prev.filter((_, i) => i !== index));
    };

    const clearAll = () => {
        setImages([]);
        setPdfPath(null);
        setReorderMode(false);
    };

    // ─── Editor ────────────────────────────────────────────────────
    const openEditor = (index) => {
        if (reorderMode) return; // don't open editor in reorder mode
        setEditingIndex(index);
    };

    const handleEditorSave = (newPath) => {
        setImages((prev) => {
            const updated = [...prev];
            updated[editingIndex] = { path: newPath };
            return updated;
        });
        setEditingIndex(null);
        setPdfPath(null);
    };

    const handleEditorCancel = () => {
        setEditingIndex(null);
    };

    // ─── Reorder ───────────────────────────────────────────────────
    const swapImages = (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        setImages((prev) => {
            const updated = [...prev];
            const temp = updated[fromIndex];
            updated[fromIndex] = updated[toIndex];
            updated[toIndex] = temp;
            return updated;
        });
    };

    const moveUp = (index) => {
        if (index === 0) return;
        swapImages(index, index - 1);
    };

    const moveDown = (index) => {
        if (index === images.length - 1) return;
        swapImages(index, index + 1);
    };

    // ─── Convert ───────────────────────────────────────────────────
    const handleConvertPress = () => {
        if (images.length === 0) {
            Alert.alert('No images', 'Please select at least one image first.');
            return;
        }
        setPdfFileName('');
        setShowNameModal(true);
    };

    const handleConvertConfirm = async () => {
        const trimmed = pdfFileName.trim();
        if (!trimmed) {
            Alert.alert('Name required', 'Please enter a file name for the PDF.');
            return;
        }
        setShowNameModal(false);
        setLoading(true);

        const hasWrite = await requestWritePermission();
        if (!hasWrite) {
            setLoading(false);
            Alert.alert('Permission needed', 'Storage write access is required to save the PDF.');
            return;
        }

        try {
            const paths = images.map((img) => img.path);
            const outputPath = await convertImagesToPDF(paths, trimmed);
            setPdfPath(outputPath);

            const newItem = {
                id: Date.now().toString(),
                name: `${trimmed}.pdf`,
                path: outputPath,
                date: new Date().toISOString(),
            };
            await saveToHistory(newItem);

            setImages([]);

            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }).start();

            Alert.alert(
                'Success ✅',
                `PDF saved to Downloads:\n${trimmed.replace(/\.pdf$/i, '')}.pdf`,
            );
        } catch (err) {
            console.error(err);
            Alert.alert('Error', 'PDF conversion failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async (path = pdfPath) => {
        if (!path) return;
        try {
            await RNShare.open({
                url: `file://${path}`,
                title: 'Share PDF',
                type: 'application/pdf',
            });
        } catch (err) {
            console.log(err);
        }
    };

    const handleOpenPdf = async (path) => {
        try {
            await FileViewer.open(path, { showOpenWithDialog: true });
        } catch (err) {
            Alert.alert('Error', 'Could not open this PDF. Please install a PDF viewer.');
            console.log(err);
        }
    };

    // ─── Render ────────────────────────────────────────────────────
    const renderImageItem = ({ item, index }) => (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => openEditor(index)}
            delayPressIn={0}
            style={styles.thumbCard}
        >
            <Image source={{ uri: item.path }} style={styles.thumb} />

            {/* Remove button - needs its own touch handling */}
            <TouchableOpacity
                style={styles.removeBtn}
                onPress={(e) => {
                    e.stopPropagation();
                    removeImage(index);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                delayPressIn={0}
            >
                <Text style={styles.removeBtnText}>✕</Text>
            </TouchableOpacity>

            {/* Page number badge - pointerEvents none so taps pass through */}
            <View style={styles.thumbIndex} pointerEvents="none">
                <Text style={styles.thumbIndexText}>{index + 1}</Text>
            </View>

            {/* Edit badge - pointerEvents none so taps pass through */}
            {!reorderMode && (
                <View style={styles.editBadge} pointerEvents="none">
                    <Text style={styles.editBadgeText}>✏️</Text>
                </View>
            )}

            {/* Reorder arrows */}
            {reorderMode && (
                <View style={styles.reorderControls}>
                    {index > 0 && (
                        <TouchableOpacity
                            style={styles.reorderBtn}
                            onPress={() => moveUp(index)}
                            delayPressIn={0}
                        >
                            <Text style={styles.reorderBtnText}>◀</Text>
                        </TouchableOpacity>
                    )}
                    {index < images.length - 1 && (
                        <TouchableOpacity
                            style={styles.reorderBtn}
                            onPress={() => moveDown(index)}
                            delayPressIn={0}
                        >
                            <Text style={styles.reorderBtnText}>▶</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <View style={styles.emptyIconOuter}>
                <Text style={styles.emptyIcon}>🖼️</Text>
            </View>
            <Text style={styles.emptyTitle}>No images selected</Text>
            <Text style={styles.emptySubtitle}>
                Tap the button below to pick photos{'\n'}from your gallery
            </Text>
        </View>
    );

    // ─── If editor is open, render it fullscreen ───────────────────
    if (editingIndex !== null) {
        return (
            <ImageEditorScreen
                imagePath={images[editingIndex].path}
                onSave={handleEditorSave}
                onCancel={handleEditorCancel}
            />
        );
    }

    return (
        <View style={styles.container}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <Text style={styles.headerIcon}>📄</Text>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>PdfPic</Text>
                    <Text style={styles.headerSubtitle}>AI Powered PDF Generation ✨</Text>
                </View>
                {images.length > 1 && (
                    <TouchableOpacity
                        style={[
                            styles.reorderToggle,
                            reorderMode && styles.reorderToggleActive,
                        ]}
                        onPress={() => setReorderMode(!reorderMode)}
                    >
                        <Text style={styles.reorderToggleText}>
                            {reorderMode ? '✓ Done' : '↕ Reorder'}
                        </Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={styles.infoButton}
                    onPress={() => setShowAboutModal(true)}
                >
                    <Text style={styles.infoButtonText}>ℹ️</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {images.length === 0 ? (
                    renderEmptyState()
                ) : (
                    <View style={styles.sectionCard}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>
                                {reorderMode
                                    ? 'Tap arrows to reorder pages'
                                    : `Selected Images (${images.length})`}
                            </Text>
                            {!reorderMode && (
                                <TouchableOpacity onPress={clearAll}>
                                    <Text style={styles.clearText}>Clear All</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Tip banner */}
                        {!reorderMode && images.length > 0 && (
                            <View style={styles.tipBanner}>
                                <Text style={styles.tipText}>
                                    💡 Tap any image to edit • Use Reorder to change page order
                                </Text>
                            </View>
                        )}

                        <FlatList
                            data={images}
                            numColumns={3}
                            scrollEnabled={false}
                            keyExtractor={(_, i) => String(i)}
                            renderItem={renderImageItem}
                            contentContainerStyle={styles.gridContainer}
                            columnWrapperStyle={styles.gridRow}
                            extraData={reorderMode}
                        />
                    </View>
                )}

                {/* ── Success Banner ── */}
                {pdfPath && (
                    <Animated.View style={[styles.successCard, { opacity: fadeAnim }]}>
                        <Text style={styles.successIcon}>✅</Text>
                        <View style={styles.successTextWrap}>
                            <Text style={styles.successTitle}>PDF Ready!</Text>
                            <Text style={styles.successSub} numberOfLines={1}>
                                Saved to Downloads folder
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare(pdfPath)}>
                            <Text style={styles.shareBtnText}>Share</Text>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* ── History Section ── */}
                {pdfHistory.length > 0 && (
                    <View style={styles.historySection}>
                        <View style={styles.historySectionHeader}>
                            <Text style={styles.historySectionIcon}>📋</Text>
                            <Text style={styles.historySectionTitle}>Recent PDFs</Text>
                            <Text style={styles.historySectionCount}>{pdfHistory.length}</Text>
                        </View>
                        {pdfHistory.map((item, index) => (
                            <View
                                key={item.id}
                                style={[
                                    styles.historyCard,
                                    index === pdfHistory.length - 1 && { marginBottom: 0 },
                                ]}
                            >
                                <View style={styles.historyCardLeft}>
                                    <View style={styles.historyIconWrap}>
                                        <Text style={styles.historyIconEmoji}>📄</Text>
                                    </View>
                                    <View style={styles.historyInfo}>
                                        <Text style={styles.historyName} numberOfLines={1}>{item.name}</Text>
                                        <Text style={styles.historyDate}>
                                            {new Date(item.date).toLocaleDateString()} • {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.historyActions}>
                                    <TouchableOpacity
                                        style={styles.historyOpenBtn}
                                        onPress={() => handleOpenPdf(item.path)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.historyOpenText}>Open</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.historyShareBtn}
                                        onPress={() => handleShare(item.path)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.historyShareText}>Share</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.historyDeleteBtn}
                                        onPress={() => deleteFromHistory(item.id, item.path)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.historyDeleteText}>Delete</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* ── Bottom Action Bar ── */}
            <View style={styles.bottomBar}>
                <TouchableOpacity style={styles.addButton} onPress={() => setShowSourceModal(true)} activeOpacity={0.8}>
                    <Text style={styles.addButtonIcon}>＋</Text>
                    <Text style={styles.addButtonText}>Add Images</Text>
                </TouchableOpacity>

                {images.length > 0 && (
                    <TouchableOpacity
                        style={[styles.convertButton, loading && styles.disabledButton]}
                        onPress={handleConvertPress}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <>
                                <Text style={styles.convertButtonIcon}>⚡</Text>
                                <Text style={styles.convertButtonText}>Convert to PDF</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}
            </View>

            {/* ── Image Source Selection Modal ── */}
            <Modal
                visible={showSourceModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowSourceModal(false)}
            >
                <TouchableOpacity
                    style={styles.aboutOverlay}
                    activeOpacity={1}
                    onPress={() => setShowSourceModal(false)}
                >
                    <TouchableOpacity activeOpacity={1} style={styles.aboutBox}>
                        <View style={styles.aboutHandle} />
                        <Text style={[styles.modalTitle, { marginBottom: 20 }]}>Add Image</Text>

                        <TouchableOpacity
                            style={styles.sourceOptionBtn}
                            onPress={() => {
                                setShowSourceModal(false);
                                setTimeout(() => scanDocument(), 300);
                            }}
                        >
                            <View style={styles.sourceOptionIconWrap}>
                                <Text style={styles.sourceOptionIconEmoji}>📸</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sourceOptionTitle}>Camera</Text>
                                <Text style={styles.sourceOptionSubtitle}>Scan documents with auto-crop</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.sourceOptionBtn, { marginBottom: 24 }]}
                            onPress={() => {
                                setShowSourceModal(false);
                                setTimeout(() => pickImages(), 300);
                            }}
                        >
                            <View style={[styles.sourceOptionIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.2)' }]}>
                                <Text style={styles.sourceOptionIconEmoji}>🖼️</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sourceOptionTitle}>Photo Library</Text>
                                <Text style={styles.sourceOptionSubtitle}>Pick photos from your gallery</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.aboutCloseBtn}
                            onPress={() => setShowSourceModal(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.aboutCloseBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* ── File-name prompt modal ── */}
            <Modal
                visible={showNameModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowNameModal(false)}
            >
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalBox}>
                            <View style={styles.modalIconWrap}>
                                <Text style={styles.modalIconEmoji}>💾</Text>
                            </View>
                            <Text style={styles.modalTitle}>Save PDF</Text>
                            <Text style={styles.modalSubtitle}>
                                Choose a name for your PDF file
                            </Text>

                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="e.g. my-document"
                                    placeholderTextColor="#64748B"
                                    value={pdfFileName}
                                    onChangeText={setPdfFileName}
                                    autoFocus
                                    selectionColor="#3B82F6"
                                />
                                <View style={styles.extensionBadge}>
                                    <Text style={styles.extensionLabel}>.pdf</Text>
                                </View>
                            </View>

                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={styles.modalCancelBtn}
                                    onPress={() => setShowNameModal(false)}
                                >
                                    <Text style={styles.modalCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.modalConfirmBtn}
                                    onPress={handleConvertConfirm}
                                >
                                    <Text style={styles.modalConfirmText}>Save & Convert</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── About Modal ── */}
            <Modal
                visible={showAboutModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowAboutModal(false)}
            >
                <TouchableOpacity
                    style={styles.aboutOverlay}
                    activeOpacity={1}
                    onPress={() => setShowAboutModal(false)}
                >
                    <TouchableOpacity activeOpacity={1} style={styles.aboutBox}>
                        {/* Drag handle */}
                        <View style={styles.aboutHandle} />

                        {/* ── Hero Section ── */}
                        <View style={styles.aboutHero}>
                            <View style={styles.aboutHeroGlow} />
                            <View style={styles.aboutIconWrap}>
                                <Text style={styles.aboutIconEmoji}>📄</Text>
                            </View>
                            <Text style={styles.aboutAppName}>PdfPic</Text>
                            <Text style={styles.aboutAppTagline}>AI Powered PDF Generation ✨</Text>
                            <View style={styles.aboutVersionBadge}>
                                <Text style={styles.aboutVersionDot}>●</Text>
                                <Text style={styles.aboutVersionText}>
                                    v{VersionCheck.getCurrentVersion()} • Build {VersionCheck.getCurrentBuildNumber()}
                                </Text>
                            </View>
                        </View>

                        {/* ── Feature Highlights ── */}
                        <View style={styles.aboutFeaturesRow}>
                            <View style={styles.aboutFeatureChip}>
                                <Text style={styles.aboutFeatureIcon}>⚡</Text>
                                <Text style={styles.aboutFeatureText}>Fast</Text>
                            </View>
                            <View style={styles.aboutFeatureChip}>
                                <Text style={styles.aboutFeatureIcon}>🔒</Text>
                                <Text style={styles.aboutFeatureText}>Offline</Text>
                            </View>
                            <View style={styles.aboutFeatureChip}>
                                <Text style={styles.aboutFeatureIcon}>✨</Text>
                                <Text style={styles.aboutFeatureText}>Edit</Text>
                            </View>
                            <View style={styles.aboutFeatureChip}>
                                <Text style={styles.aboutFeatureIcon}>📑</Text>
                                <Text style={styles.aboutFeatureText}>Reorder</Text>
                            </View>
                        </View>

                        {/* ── About Description ── */}
                        <View style={styles.aboutInfoCard}>
                            <Text style={styles.aboutInfoDesc}>
                                Convert your images into high-quality PDF documents instantly. Pick, edit, reorder, and export — all in seconds, completely offline.
                            </Text>
                        </View>

                        {/* ── Developer & Contact ── */}
                        <View style={styles.aboutDevSection}>
                            <View style={styles.aboutDevRow}>
                                <View style={styles.aboutDevAvatar}>
                                    <Text style={styles.aboutDevAvatarText}>S</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.aboutDevLabel}>DEVELOPED BY</Text>
                                    <Text style={styles.aboutDevName}>SyntaxLabs</Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={styles.aboutContactBtn}
                                onPress={() => Linking.openURL('mailto:syntaxlabs.hq.sa@gmail.com')}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.aboutContactIcon}>✉️</Text>
                                <Text style={styles.aboutContactLabel}>Get in Touch</Text>
                                <Text style={styles.aboutContactArrow}>→</Text>
                            </TouchableOpacity>
                        </View>

                        {/* ── Close button ── */}
                        <TouchableOpacity
                            style={styles.aboutCloseBtn}
                            onPress={() => setShowAboutModal(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.aboutCloseBtnText}>Done</Text>
                        </TouchableOpacity>

                        {/* Made with love */}
                        <Text style={styles.aboutFooter}>Made with ❤️ in India</Text>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
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
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    headerIcon: {
        fontSize: 28,
        marginRight: 12,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#F1F5F9',
        letterSpacing: 0.3,
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#64748B',
        marginTop: 1,
    },
    reorderToggle: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    reorderToggleActive: {
        backgroundColor: 'rgba(59,130,246,0.15)',
        borderColor: 'rgba(59,130,246,0.3)',
    },
    reorderToggleText: {
        color: '#60A5FA',
        fontSize: 13,
        fontWeight: '700',
    },

    /* Scroll */
    scrollArea: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 120,
    },

    /* Empty State */
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyIconOuter: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(59,130,246,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyIcon: {
        fontSize: 36,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#CBD5E1',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#475569',
        textAlign: 'center',
        lineHeight: 20,
    },

    /* Section Card */
    sectionCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#E2E8F0',
    },
    clearText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#F87171',
    },

    /* Tip banner */
    tipBanner: {
        backgroundColor: 'rgba(59,130,246,0.08)',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.12)',
    },
    tipText: {
        fontSize: 12,
        color: '#60A5FA',
        textAlign: 'center',
    },

    /* Grid */
    gridContainer: {
        gap: 8,
    },
    gridRow: {
        gap: 8,
    },
    thumbCard: {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
    },
    thumb: {
        width: '100%',
        height: '100%',
    },
    removeBtn: {
        position: 'absolute',
        top: 5,
        right: 5,
        backgroundColor: 'rgba(0,0,0,0.6)',
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    removeBtnText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    thumbIndex: {
        position: 'absolute',
        bottom: 5,
        left: 5,
        backgroundColor: 'rgba(59,130,246,0.85)',
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    thumbIndexText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    editBadge: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        backgroundColor: 'rgba(0,0,0,0.5)',
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editBadgeText: {
        fontSize: 12,
    },

    /* Reorder controls */
    reorderControls: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 4,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    reorderBtn: {
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    reorderBtnText: {
        color: '#60A5FA',
        fontSize: 14,
        fontWeight: '700',
    },

    /* Success Card */
    successCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderRadius: 14,
        padding: 16,
        marginTop: 16,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.25)',
    },
    successIcon: {
        fontSize: 22,
        marginRight: 12,
    },
    successTextWrap: {
        flex: 1,
    },
    successTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#34D399',
    },
    successSub: {
        fontSize: 12,
        color: '#6EE7B7',
        marginTop: 2,
    },
    shareBtn: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.35)',
    },
    shareBtnText: {
        color: '#34D399',
        fontSize: 13,
        fontWeight: '700',
    },

    /* History */
    historySection: {
        marginTop: 20,
    },
    historySectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    historySectionIcon: {
        fontSize: 18,
        marginRight: 8,
    },
    historySectionTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: '#E2E8F0',
        flex: 1,
    },
    historySectionCount: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 10,
        overflow: 'hidden',
    },
    historyCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    historyCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    historyIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    historyIconEmoji: {
        fontSize: 20,
    },
    historyInfo: {
        flex: 1,
        marginLeft: 12,
    },
    historyName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#F1F5F9',
        marginBottom: 3,
    },
    historyDate: {
        fontSize: 12,
        color: '#64748B',
    },
    historyActions: {
        flexDirection: 'row',
        gap: 8,
    },
    historyOpenBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: 'rgba(59,130,246,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.25)',
    },
    historyOpenText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#60A5FA',
    },
    historyShareBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    historyShareText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#94A3B8',
    },
    historyDeleteBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    historyDeleteText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#F87171',
    },

    /* Bottom Action Bar */
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 14,
        paddingBottom: Platform.OS === 'ios' ? 30 : 14,
        gap: 10,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    addButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(59,130,246,0.12)',
        borderWidth: 1.5,
        borderColor: 'rgba(59,130,246,0.3)',
    },
    addButtonIcon: {
        fontSize: 18,
        color: '#60A5FA',
        marginRight: 6,
    },
    addButtonText: {
        color: '#60A5FA',
        fontSize: 15,
        fontWeight: '700',
    },
    convertButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#3B82F6',
    },
    convertButtonIcon: {
        fontSize: 15,
        marginRight: 6,
    },
    convertButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    disabledButton: {
        opacity: 0.5,
    },

    /* Modal */
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBox: {
        width: '88%',
        backgroundColor: '#1E293B',
        borderRadius: 20,
        padding: 28,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        elevation: 20,
    },
    modalIconWrap: {
        alignSelf: 'center',
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(59,130,246,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    modalIconEmoji: {
        fontSize: 26,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#F1F5F9',
        textAlign: 'center',
        marginBottom: 4,
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 24,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalInput: {
        flex: 1,
        backgroundColor: '#0F172A',
        borderWidth: 1.5,
        borderColor: 'rgba(59,130,246,0.25)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        fontSize: 16,
        color: '#E2E8F0',
    },
    extensionBadge: {
        backgroundColor: 'rgba(59,130,246,0.15)',
        paddingHorizontal: 12,
        paddingVertical: 13,
        borderRadius: 12,
        marginLeft: 8,
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.2)',
    },
    extensionLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: '#60A5FA',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    modalCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    modalCancelText: {
        fontSize: 15,
        color: '#94A3B8',
        fontWeight: '700',
    },
    modalConfirmBtn: {
        flex: 1.5,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: '#3B82F6',
    },
    modalConfirmText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },

    /* Image Source Modal */
    sourceOptionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(15,23,42,0.6)',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    sourceOptionIconWrap: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(59,130,246,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.2)',
    },
    sourceOptionIconEmoji: {
        fontSize: 22,
    },
    sourceOptionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#F1F5F9',
        marginBottom: 2,
    },
    sourceOptionSubtitle: {
        fontSize: 13,
        color: '#64748B',
    },

    /* Info Button */
    infoButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    infoButtonText: {
        fontSize: 18,
    },

    /* About Modal */
    aboutOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    aboutBox: {
        backgroundColor: '#1E293B',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 56,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    aboutHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignSelf: 'center',
        marginBottom: 24,
    },

    /* Hero */
    aboutHero: {
        alignItems: 'center',
        marginBottom: 20,
        position: 'relative',
    },
    aboutHeroGlow: {
        position: 'absolute',
        top: -10,
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(59,130,246,0.08)',
    },
    aboutIconWrap: {
        width: 68,
        height: 68,
        borderRadius: 20,
        backgroundColor: 'rgba(59,130,246,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(59,130,246,0.25)',
    },
    aboutIconEmoji: {
        fontSize: 32,
    },
    aboutAppName: {
        fontSize: 26,
        fontWeight: '900',
        color: '#F1F5F9',
        letterSpacing: 0.5,
    },
    aboutAppTagline: {
        fontSize: 14,
        color: '#64748B',
        marginTop: 4,
    },
    aboutVersionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16,185,129,0.1)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        marginTop: 12,
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.2)',
    },
    aboutVersionDot: {
        fontSize: 8,
        color: '#34D399',
        marginRight: 6,
    },
    aboutVersionText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#34D399',
    },

    /* Feature Chips */
    aboutFeaturesRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 16,
    },
    aboutFeatureChip: {
        alignItems: 'center',
        backgroundColor: 'rgba(15,23,42,0.6)',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        minWidth: 70,
    },
    aboutFeatureIcon: {
        fontSize: 18,
        marginBottom: 4,
    },
    aboutFeatureText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#94A3B8',
    },

    /* Info Card */
    aboutInfoCard: {
        backgroundColor: 'rgba(15,23,42,0.5)',
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.04)',
    },
    aboutInfoDesc: {
        fontSize: 13,
        color: '#94A3B8',
        lineHeight: 20,
        textAlign: 'center',
    },

    /* Developer Section */
    aboutDevSection: {
        backgroundColor: 'rgba(15,23,42,0.5)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.04)',
    },
    aboutDevRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    aboutDevAvatar: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(139,92,246,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        borderWidth: 1,
        borderColor: 'rgba(139,92,246,0.25)',
    },
    aboutDevAvatarText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#A78BFA',
    },
    aboutDevLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 2,
    },
    aboutDevName: {
        fontSize: 16,
        fontWeight: '800',
        color: '#E2E8F0',
    },
    aboutContactBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(59,130,246,0.1)',
        borderRadius: 10,
        paddingVertical: 11,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.2)',
    },
    aboutContactIcon: {
        fontSize: 16,
        marginRight: 8,
    },
    aboutContactLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#60A5FA',
        flex: 1,
    },
    aboutContactArrow: {
        fontSize: 14,
        color: '#60A5FA',
        fontWeight: '600',
    },

    /* Close & Footer */
    aboutCloseBtn: {
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    aboutCloseBtnText: {
        fontSize: 15,
        color: '#CBD5E1',
        fontWeight: '700',
    },
    aboutFooter: {
        fontSize: 11,
        color: '#475569',
        textAlign: 'center',
        marginTop: 14,
    },
});