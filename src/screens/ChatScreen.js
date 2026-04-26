import { Text, TouchableOpacity, View, TextInput, FlatList, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { commonStyles } from '../styles/commonStyles';
import { COLORS } from '../styles/colors';
import { useAppContext } from '../context/AppContext';
import { addMessage, loadMessages, loadKnownUsers, saveKnownUser } from '../storage';
import { encryptMessage, decryptMessage } from '../services/cryptoService';
import BottomNav from '../components/BottomNav';

export default function ChatScreen({ navigation, route }) {
  const { user, nearbyEmbassies, officials, admin, nearbyUsers, isOnline, connectionType } = useAppContext();
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
    loadMessages().then(setMessages);
  }, []);

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
    const updated = await loadMessages();
    setMessages(updated);
    setMessageText('');
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
      <View style={[styles.messageBubble, own ? styles.ownMessage : styles.otherMessage]}>
        {!own && <Text style={styles.messageSender}>{item.senderName}</Text>}
        <Text style={styles.messageText}>{displayText}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
          {item.isEncrypted && (
            <Ionicons name="lock-closed" size={10} color={COLORS.whiteAlpha50} style={{ marginRight: 4 }} />
          )}
          <Text style={styles.messageTime}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
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
    <SafeAreaView style={commonStyles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Top Info Bar */}
        <View style={commonStyles.topBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {chatPartner && (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 10 }}>
                <Ionicons name="arrow-back" size={22} color={COLORS.white} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={commonStyles.topBarTitle}>{chatTitle}</Text>
              <Text style={commonStyles.topBarSubtitle}>{chatSubtitle}</Text>
            </View>
          </View>
          {!chatPartner && (
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                style={[commonStyles.buttonSmall, { marginRight: 6 }]}
                onPress={() => setActiveTab('search')}
              >
                <Ionicons name="search" size={14} color={COLORS.white} />
                <Text style={[commonStyles.buttonTextSmall, { marginLeft: 4 }]}>Find</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={commonStyles.buttonSmall}
                onPress={() => navigation.navigate('Nearby')}
              >
                <Ionicons name="person-add" size={14} color={COLORS.white} />
                <Text style={[commonStyles.buttonTextSmall, { marginLeft: 4 }]}>Nearby</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Tab Bar - only show when not in direct chat */}
        {!chatPartner && (
          <View style={styles.tabBar}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, activeTab === tab.id && styles.activeTab]}
                onPress={() => {
                  setActiveTab(tab.id);
                  setSelectedChannel(null);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={activeTab === tab.id ? COLORS.white : COLORS.whiteAlpha50}
                />
                <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
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
                  style={[styles.textInput, { flex: 1, marginRight: 8 }]}
                  placeholder="Search by User ID or name..."
                  placeholderTextColor={COLORS.grayDark}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="characters"
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
                <TouchableOpacity style={styles.sendButton} onPress={handleSearch} activeOpacity={0.7}>
                  <Ionicons name="search" size={18} color={COLORS.white} />
                </TouchableOpacity>
              </View>

              {isSearching && (
                <Text style={[commonStyles.infoText, { textAlign: 'center' }]}>Searching...</Text>
              )}

              {!isSearching && searchResults.length === 0 && searchQuery.trim() ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Ionicons name="person-outline" size={40} color={COLORS.grayDark} />
                  <Text style={[commonStyles.infoText, { textAlign: 'center', marginTop: 8 }]}>
                    No users found. Try a different ID or name.
                  </Text>
                </View>
              ) : (
                searchResults.map((foundUser) => (
                  <TouchableOpacity
                    key={foundUser.id}
                    style={commonStyles.listItem}
                    onPress={async () => {
                      await saveKnownUser(foundUser);
                      navigation.navigate('Chat', { user: foundUser });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[commonStyles.statusDot, { backgroundColor: COLORS.green }]} />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={commonStyles.listItemTitle}>{foundUser.username || foundUser.id}</Text>
                        <Text style={commonStyles.listItemSub}>{foundUser.id}</Text>
                      </View>
                      <Ionicons name="chatbubble" size={18} color={COLORS.primaryBlueLight} />
                    </View>
                  </TouchableOpacity>
                ))
              )}

              {/* Your ID for sharing */}
              <View style={[commonStyles.card, { marginTop: 20 }]}>
                <Text style={commonStyles.cardTitle}>Your User ID</Text>
                <Text style={[commonStyles.listItemTitle, { fontSize: 18, textAlign: 'center', marginVertical: 8, letterSpacing: 2 }]}>
                  {user?.id || '...'}
                </Text>
                <Text style={commonStyles.caption}>Share this ID so others can find you</Text>
              </View>
            </ScrollView>
          )}

          {/* Channel Selection for Embassies/Consulates */}
          {!chatPartner && (activeTab === 'embassies' || activeTab === 'consulates') && !selectedChannel && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              <Text style={commonStyles.sectionHeader}>
                {activeTab === 'embassies' ? 'Nearby Embassies' : 'Nearby Consulates'}
              </Text>
              {locationChannels.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Ionicons name={activeTab === 'embassies' ? 'flag-outline' : 'business-outline'} size={40} color={COLORS.grayDark} />
                  <Text style={[commonStyles.infoText, { textAlign: 'center', marginTop: 8 }]}>
                    No {activeTab} found within 200km of your location.
                  </Text>
                </View>
              ) : (
                locationChannels.map((channel) => (
                  <TouchableOpacity
                    key={channel.id}
                    style={commonStyles.listItem}
                    onPress={() => setSelectedChannel(channel.id)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name={activeTab === 'embassies' ? 'flag' : 'business'} size={18} color={COLORS.primaryBlueLight} />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={commonStyles.listItemTitle}>{channel.name}</Text>
                        <Text style={commonStyles.listItemSub}>{channel.address || channel.locationName || ''}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={COLORS.gray} />
                    </View>
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity
                style={{ marginTop: 12, padding: 10, alignItems: 'center' }}
                onPress={() => setActiveTab('chat')}
              >
                <Text style={{ color: COLORS.primaryBlueLight, fontSize: 14, fontWeight: '600' }}>
                  Back to Chat
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Messages List */}
          {(chatPartner || (activeTab === 'chat' && !chatPartner) || selectedChannel) && (
            <View style={{ flex: 1 }}>
              {selectedChannel && (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.surface }}>
                  <TouchableOpacity onPress={() => setSelectedChannel(null)} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={22} color={COLORS.white} />
                  </TouchableOpacity>
                  <Text style={[commonStyles.cardTitle, { marginLeft: 10, flex: 1 }]}>
                    {locationChannels.find(c => c.id === selectedChannel)?.name || selectedChannel}
                  </Text>
                </View>
              )}

              {filteredMessages.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
                  <Ionicons name="chatbubbles-outline" size={48} color={COLORS.grayDark} />
                  <Text style={[commonStyles.infoText, { textAlign: 'center', marginTop: 12 }]}>
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
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.textInput}
                    placeholder={chatPartner ? `Message ${chatPartner.name || chatPartner.id}...` : selectedChannel ? "Post to channel..." : "Type a message..."}
                    placeholderTextColor={COLORS.grayDark}
                    value={messageText}
                    onChangeText={setMessageText}
                    multiline
                    maxLength={500}
                  />
                  <TouchableOpacity
                    style={[styles.sendButton, !messageText.trim() && { opacity: 0.4 }]}
                    onPress={handleSendMessage}
                    disabled={!messageText.trim()}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="send" size={20} color={COLORS.white} />
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

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.primaryBlue,
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
    backgroundColor: COLORS.primaryBlueLight,
  },
  tabText: {
    color: COLORS.whiteAlpha50,
    fontSize: 13,
    marginLeft: 5,
    fontWeight: '500',
  },
  activeTabText: {
    color: COLORS.white,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.darkBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 80,
    color: COLORS.white,
    fontSize: 15,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryBlue,
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
    backgroundColor: COLORS.primaryBlue,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    backgroundColor: COLORS.surfaceLight,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageSender: {
    color: COLORS.primaryBlueLight,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  messageText: {
    color: COLORS.white,
    fontSize: 14,
    lineHeight: 19,
  },
  messageTime: {
    color: COLORS.whiteAlpha50,
    fontSize: 10,
    marginTop: 3,
    textAlign: 'right',
  },
});
