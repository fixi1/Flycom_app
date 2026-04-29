import { Text, TouchableOpacity, View, TextInput, FlatList, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { addMessage, loadKnownUsers, saveKnownUser } from '../storage';
import { encryptMessage, decryptMessage } from '../services/cryptoService';
import BottomNav from '../components/BottomNav';

export default function ChatScreen({ navigation, route }) {
  const { user, nearbyEmbassies, officials, admin, nearbyUsers, isOnline, connectionType, sendBleMessage, broadcastBleMessage, sendCloudMessage, hasInternet, messages: contextMessages, refreshMessages } = useAppContext();
  const { styles, colors } = useTheme();
  const chatPartner = route.params?.user || null;
  const [activeTab, setActiveTab] = useState('chat');
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const flatListRef = useRef(null);

  const tabs = [
    { id: 'chat', label: 'Chat', icon: 'chatbubbles' },
    { id: 'embassies', label: 'Embassies', icon: 'flag' },
    { id: 'consulates', label: 'Consulates', icon: 'business' },
  ];

  const locationChannels = nearbyEmbassies.filter(e => e.type === (activeTab === 'embassies' ? 'embassy' : 'consulate'));

  const canType = !!(chatPartner || selectedChannel || (activeTab === 'chat' && !chatPartner));

  useEffect(() => {
    setMessages(contextMessages);
  }, [contextMessages]);

  const isOfficial = (userId) => {
    return officials.some(o => o.userId === userId);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const knownUsers = await loadKnownUsers();
      const query = searchQuery.trim().toUpperCase();
      const results = knownUsers.filter(u =>
        u.id.toUpperCase().includes(query) ||
        (u.username && u.username.toUpperCase().includes(query))
      );
      const nearbyMatches = nearbyUsers.filter(u =>
        u.id.toUpperCase().includes(query) ||
        (u.name && u.name.toUpperCase().includes(query))
      );
      const allResults = [...results];
      nearbyMatches.forEach(u => {
        if (!allResults.find(r => r.id === u.id)) {
          allResults.push({ id: u.id, username: u.name || u.id });
        }
      });
      setSearchResults(allResults);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    if (!canType) {
      Alert.alert('Select a Conversation', 'Choose someone to chat with or select a channel first.');
      return;
    }

    const isOfficialChannel = activeTab === 'embassies' || activeTab === 'consulates';

    if (isOfficialChannel && !selectedChannel) {
      Alert.alert('Select Channel', 'Please select a channel first');
      return;
    }

    const userIsOfficial = isOfficial(user?.id);

    if (isOfficialChannel && !userIsOfficial && !admin) {
      Alert.alert(
        'Access Denied',
        'Only officials and admins can post in these channels.',
        [{ text: 'OK' }]
      );
      return;
    }

    const recipientId = chatPartner?.id || (isOfficialChannel ? selectedChannel : null);
    let encryptedText = messageText;
    let isEncrypted = false;
    try {
      if (recipientId && recipientId !== 'broadcast') {
        const encrypted = await encryptMessage(messageText, recipientId);
        if (encrypted) {
          encryptedText = encrypted;
          isEncrypted = true;
        }
      }
    } catch (e) {
    }

    const message = {
      text: messageText,
      encryptedText,
      isEncrypted,
      senderId: user?.id,
      senderName: user?.username || user?.id,
      recipientId: recipientId || (isOfficialChannel ? selectedChannel : 'broadcast'),
      channel: selectedChannel || (chatPartner ? chatPartner.id : 'main-chat'),
      channelType: activeTab === 'search' ? 'chat' : activeTab,
      isOfficial: userIsOfficial,
      transport: connectionType === 'BLE' ? 'mesh' : (isOnline ? 'internet' : 'mesh'),
    };

    await addMessage(message);
    await refreshMessages();
    setMessageText('');

    const cloudPayload = {
      type: chatPartner ? 'CHAT' : 'BROADCAST',
      text: messageText,
      senderId: user?.id,
      senderName: user?.username || user?.id,
      recipientId: chatPartner?.id || 'broadcast',
      timestamp: Date.now(),
    };

    if (sendCloudMessage) {
      try {
        await sendCloudMessage(cloudPayload);
      } catch (e) {
        console.warn('Cloud send failed:', e?.message);
      }
    }

    if (chatPartner?.deviceAddress) {
      try {
        await sendBleMessage(chatPartner.deviceAddress, JSON.stringify(cloudPayload));
      } catch (e) {
        console.warn('BLE send failed:', e?.message);
      }
    } else if (!chatPartner) {
      try {
        await broadcastBleMessage(JSON.stringify(cloudPayload));
      } catch (e) {
        console.warn('BLE broadcast failed:', e?.message);
      }
    }
  };

  const filteredMessages = messages.filter(msg => {
    const tabType = activeTab === 'search' ? 'chat' : activeTab;
    if (tabType === 'chat') {
      if (chatPartner) {
        return (msg.channelType === 'chat') &&
          ((msg.senderId === user?.id && msg.recipientId === chatPartner.id) ||
           (msg.senderId === chatPartner.id && msg.recipientId === user?.id) ||
           (msg.senderId === chatPartner.id && msg.recipientId === 'broadcast') ||
           (msg.channel === chatPartner.id));
      }
      return msg.channelType === 'chat';
    }
    if (tabType === 'embassies' || tabType === 'consulates') {
      if (!selectedChannel) return false;
      return msg.channel === selectedChannel && msg.channelType === tabType;
    }
    return true;
  });

  const isOwnMessage = (msg) => msg.senderId === user?.id;

  const renderMessage = ({ item }) => {
    const own = isOwnMessage(item);
    let displayText = item.text;
    if (!own && item.isEncrypted && item.encryptedText) {
      try {
        const decrypted = decryptMessage(item.encryptedText, item.senderId);
        if (decrypted) displayText = decrypted;
      } catch (e) {
        displayText = '[Encrypted message]';
      }
    }
    return (
      <View style={[localStyles.messageBubble, own ? localStyles.ownMessage : localStyles.otherMessage]}>
        {!own && <Text style={localStyles.messageSender}>{item.senderName}</Text>}
        <Text style={localStyles.messageText}>{displayText}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
          {item.isEncrypted && (
            <Ionicons name="lock-closed" size={10} color={colors.whiteAlpha50} style={{ marginRight: 4 }} />
          )}
          <Text style={localStyles.messageTime}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      </View>
    );
  };

  const chatTitle = chatPartner
    ? (chatPartner.name || chatPartner.id)
    : (activeTab === 'search' ? 'Find Users' : activeTab === 'chat' ? 'Messages' : activeTab);

  const chatSubtitle = chatPartner
    ? chatPartner.id
    : (activeTab === 'search' ? 'Search by ID or name' : activeTab === 'chat' ? 'Peer-to-peer' : 'Nearby');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Top Info Bar */}
        <View style={styles.topBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {chatPartner && (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 10 }}>
                <Ionicons name="arrow-back" size={22} color={colors.white} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.topBarTitle}>{chatTitle}</Text>
              <Text style={styles.topBarSubtitle}>{chatSubtitle}</Text>
            </View>
          </View>
          {!chatPartner && (
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                style={[styles.buttonSmall, { marginRight: 6 }]}
                onPress={() => setActiveTab('search')}
              >
                <Ionicons name="search" size={14} color={colors.white} />
                <Text style={[styles.buttonTextSmall, { marginLeft: 4 }]}>Find</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.buttonSmall}
                onPress={() => navigation.navigate('Nearby')}
              >
                <Ionicons name="person-add" size={14} color={colors.white} />
                <Text style={[styles.buttonTextSmall, { marginLeft: 4 }]}>Nearby</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Tab Bar - only show when not in direct chat */}
        {!chatPartner && (
          <View style={localStyles.tabBar}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[localStyles.tab, activeTab === tab.id && localStyles.activeTab]}
                onPress={() => {
                  setActiveTab(tab.id);
                  setSelectedChannel(null);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={activeTab === tab.id ? colors.white : colors.whiteAlpha50}
                />
                <Text style={[localStyles.tabText, activeTab === tab.id && localStyles.activeTabText]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Main Content */}
        <View style={{ flex: 1 }}>
          {/* Search Tab */}
          {!chatPartner && activeTab === 'search' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <TextInput
                  style={[localStyles.textInput, { flex: 1, marginRight: 8 }]}
                  placeholder="Search by User ID or name..."
                  placeholderTextColor={colors.grayDark}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="characters"
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
                <TouchableOpacity style={localStyles.sendButton} onPress={handleSearch} activeOpacity={0.7}>
                  <Ionicons name="search" size={18} color={colors.white} />
                </TouchableOpacity>
              </View>

              {isSearching && (
                <Text style={[styles.infoText, { textAlign: 'center' }]}>Searching...</Text>
              )}

              {!isSearching && searchResults.length === 0 && searchQuery.trim() ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Ionicons name="person-outline" size={40} color={colors.grayDark} />
                  <Text style={[styles.infoText, { textAlign: 'center', marginTop: 8 }]}>
                    No users found. Try a different ID or name.
                  </Text>
                </View>
              ) : (
                searchResults.map((foundUser) => (
                  <TouchableOpacity
                    key={foundUser.id}
                    style={styles.listItem}
                    onPress={async () => {
                      await saveKnownUser(foundUser);
                      navigation.navigate('Chat', { user: foundUser });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={styles.listItemTitle}>{foundUser.username || foundUser.id}</Text>
                        <Text style={styles.listItemSub}>{foundUser.id}</Text>
                      </View>
                      <Ionicons name="chatbubble" size={18} color={colors.primaryBlueLight} />
                    </View>
                  </TouchableOpacity>
                ))
              )}

              {/* Your ID for sharing */}
              <View style={[styles.card, { marginTop: 20 }]}>
                <Text style={styles.cardTitle}>Your User ID</Text>
                <Text style={[styles.listItemTitle, { fontSize: 18, textAlign: 'center', marginVertical: 8, letterSpacing: 2 }]}>
                  {user?.id || '...'}
                </Text>
                <Text style={styles.caption}>Share this ID so others can find you</Text>
              </View>
            </ScrollView>
          )}

          {/* Channel Selection for Embassies/Consulates */}
          {!chatPartner && (activeTab === 'embassies' || activeTab === 'consulates') && !selectedChannel && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.sectionHeader}>
                {activeTab === 'embassies' ? 'Nearby Embassies' : 'Nearby Consulates'}
              </Text>
              {locationChannels.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Ionicons name={activeTab === 'embassies' ? 'flag-outline' : 'business-outline'} size={40} color={colors.grayDark} />
                  <Text style={[styles.infoText, { textAlign: 'center', marginTop: 8 }]}>
                    No {activeTab} found within 200km of your location.
                  </Text>
                </View>
              ) : (
                locationChannels.map((channel) => (
                  <TouchableOpacity
                    key={channel.id}
                    style={styles.listItem}
                    onPress={() => setSelectedChannel(channel.id)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name={activeTab === 'embassies' ? 'flag' : 'business'} size={18} color={colors.primaryBlueLight} />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={styles.listItemTitle}>{channel.name}</Text>
                        <Text style={styles.listItemSub}>{channel.address || channel.locationName || ''}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.gray} />
                    </View>
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity
                style={{ marginTop: 12, padding: 10, alignItems: 'center' }}
                onPress={() => setActiveTab('chat')}
              >
                <Text style={{ color: colors.primaryBlueLight, fontSize: 14, fontWeight: '600' }}>
                  Back to Chat
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Messages List */}
          {(chatPartner || (activeTab === 'chat' && !chatPartner) || selectedChannel) && (
            <View style={{ flex: 1 }}>
              {selectedChannel && (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface }}>
                  <TouchableOpacity onPress={() => setSelectedChannel(null)} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={22} color={colors.white} />
                  </TouchableOpacity>
                  <Text style={[styles.cardTitle, { marginLeft: 10, flex: 1 }]}>
                    {locationChannels.find(c => c.id === selectedChannel)?.name || selectedChannel}
                  </Text>
                </View>
              )}

              {filteredMessages.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
                  <Ionicons name="chatbubbles-outline" size={48} color={colors.grayDark} />
                  <Text style={[styles.infoText, { textAlign: 'center', marginTop: 12 }]}>
                    {chatPartner
                      ? `No messages with ${chatPartner.name || chatPartner.id} yet. Say hello!`
                      : 'Select a conversation or find a user to start chatting.'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={filteredMessages}
                  renderItem={renderMessage}
                  keyExtractor={(item) => item.id}
                  inverted
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}
                  keyboardShouldPersistTaps="handled"
                  onContentSizeChange={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: false })}
                />
              )}

              {/* Message Input - only show when can type */}
              {canType && (
                <View style={localStyles.inputContainer}>
                  <TextInput
                    style={localStyles.textInput}
                    placeholder={chatPartner ? `Message ${chatPartner.name || chatPartner.id}...` : selectedChannel ? "Post to channel..." : "Type a message..."}
                    placeholderTextColor={colors.grayDark}
                    value={messageText}
                    onChangeText={setMessageText}
                    multiline
                    maxLength={500}
                  />
                  <TouchableOpacity
                    style={[localStyles.sendButton, !messageText.trim() && { opacity: 0.4 }]}
                    onPress={handleSendMessage}
                    disabled={!messageText.trim()}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="send" size={20} color={colors.white} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Bottom Navigation */}
        <BottomNav navigation={navigation} activeScreen="Chat" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#2626A2',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    marginHorizontal: 2,
  },
  activeTab: {
    backgroundColor: '#3B3BBF',
  },
  tabText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    marginLeft: 5,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#3A3A3A',
    borderTopWidth: 1,
    borderTopColor: '#4A4A4A',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 80,
    color: '#FFFFFF',
    fontSize: 15,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2626A2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBubble: {
    padding: 10,
    borderRadius: 12,
    marginVertical: 3,
    maxWidth: '75%',
  },
  ownMessage: {
    backgroundColor: '#2626A2',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    backgroundColor: '#4A4A4A',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageSender: {
    color: '#3B3BBF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 19,
  },
  messageTime: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    marginTop: 3,
    textAlign: 'right',
  },
});
