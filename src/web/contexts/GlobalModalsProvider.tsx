import { createContext, useCallback, useContext, useState } from 'react';
import PostsContainingMediaModal from '../modals/PostsContainingMediaModal';
import BrowseSettingsModal from '../modals/BrowseSettingsModal';

interface GlobalModalsProviderProps {
  children: React.ReactNode;
}

interface GlobalModalsContextValue {
  showPostsContainingMediaModal: (url: string) => void;
  closePostsContainingMediaModal: () => void;
  showBrowseSettingsModal: () => void;
  closeBrowseSettingsModal: () => void;
}

const GlobalModalsContext = createContext({} as GlobalModalsContextValue);

function GlobalModalsProvider(props: GlobalModalsProviderProps) {
  const { children } = props;
  const [postsContainingMediaModalURL, setPostsContainingMediaModalURL] =
    useState<string | null>(null);
  const [
    postsContainingMediaModalVisible,
    setPostsContainingMediaModalVisible
  ] = useState(false);
  const [browseSettingsModalVisible, setBrowseSettingsModalVisible] =
    useState(false);

  const showPostsContainingMediaModal = useCallback((url: string) => {
    setPostsContainingMediaModalURL(url);
    setPostsContainingMediaModalVisible(true);
  }, []);

  const closePostsContainingMediaModal = useCallback(() => {
    setPostsContainingMediaModalVisible(false);
  }, []);

  const showBrowseSettingsModal = useCallback(() => {
    setBrowseSettingsModalVisible(true);
  }, []);

  const closeBrowseSettingsModal = useCallback(() => {
    setBrowseSettingsModalVisible(false);
  }, []);

  return (
    <GlobalModalsContext.Provider
      value={{
        showPostsContainingMediaModal,
        closePostsContainingMediaModal,
        showBrowseSettingsModal,
        closeBrowseSettingsModal
      }}
    >
      {children}
      <PostsContainingMediaModal
        url={postsContainingMediaModalURL}
        show={postsContainingMediaModalVisible}
        onClose={closePostsContainingMediaModal}
      />
      <BrowseSettingsModal
        show={browseSettingsModalVisible}
        onClose={closeBrowseSettingsModal}
      />
    </GlobalModalsContext.Provider>
  );
}

const useGlobalModals = () => useContext(GlobalModalsContext);

export { useGlobalModals, GlobalModalsProvider };
