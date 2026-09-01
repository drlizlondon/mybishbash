import { useState } from "react";
import GeneratedPackCover from "../../GeneratedPackCover";
import ExpandableCollection from "./ExpandableCollection";
import CollectionPreviewRow from "./CollectionPreviewRow";
import { getLibraryPersonalSecondary, getLibraryCommitmentSecondary, getLibraryPackSecondary } from "./librarySecondary";

export default function StandardLibraryPanel({
  personalItems,
  commitmentItems,
  activePackItems,
  doInsteadItems,
  libraryPacks = [],
  timezone,
  menuOpenId,
  setMenuOpenId,
  openEditor,
  handleResetItem,
  handleTogglePause,
  handleDeleteCard,
  handleDuplicateCard,
  openSpecificReveal,
  openPackReveal,
  deactivatePack,
  onCreatePersonal,
  onCreateCommitment,
  onAddPack,
  onToggleActionCardHidden,
  onDeleteActionCard,
  onCreateActionCard,
}) {
  const [openSections, setOpenSections] = useState({
    personal: false,
    commitments: false,
    activePacks: false,
    doInstead: false,
  });
  const personalOpen = openSections.personal;
  const commitmentsOpen = openSections.commitments;
  const activePacksOpen = openSections.activePacks;
  const doInsteadOpen = openSections.doInstead;
  const personalCountLabel = `${personalItems.length} ${personalItems.length === 1 ? "card" : "cards"}`;
  const commitmentCountLabel = `${commitmentItems.length} ${commitmentItems.length === 1 ? "card" : "cards"}`;
  const activePackCountLabel = `${activePackItems.length} ${activePackItems.length === 1 ? "pack" : "packs"}`;
  const doInsteadCountLabel = `${doInsteadItems.length} ${doInsteadItems.length === 1 ? "card" : "cards"}`;

  function toggleSection(sectionId) {
    setOpenSections((current) => ({ ...current, [sectionId]: !current[sectionId] }));
  }

  function personalActions(item) {
    return [
      { label: "Edit", onClick: () => openEditor(item.id) },
      { label: "Duplicate", onClick: () => handleDuplicateCard(item.id) },
      { label: "Reset for today", onClick: () => handleResetItem(item) },
      { label: item.representative.paused ? "Unpause" : "Pause", onClick: () => handleTogglePause(item) },
      { label: "Delete", danger: true, onClick: () => handleDeleteCard(item.id) },
    ];
  }

  function packActions(item) {
    return [
      { label: "Open card", onClick: () => openPackReveal(item.id) },
      { label: "Reset for today", onClick: () => handleResetItem(item) },
      { label: item.representative.paused ? "Unpause" : "Pause", onClick: () => handleTogglePause(item) },
      { label: "Remove pack", danger: true, onClick: () => deactivatePack(item.id) },
    ];
  }

  return (
    <section className="library" data-testid="library-panel">
      <div className="section-heading solo">
        <div>
          <h2>Library</h2>
          <p>Your own myBishBash cards, gathered in one quiet place.</p>
        </div>
      </div>
      <div className="library-sections">
        <section className="library-section-group">
          <ExpandableCollection
            id="personal-card-section"
            icon="heart"
            title="Personal Cards"
            description="Cards you have written for yourself."
            countLabel={personalCountLabel}
            items={personalItems}
            isOpen={personalOpen}
            onToggle={() => toggleSection("personal")}
            onAdd={onCreatePersonal}
            addLabel="Create personal card"
            testId="library-personal-section"
            emptyLabel="No personal cards yet"
            renderRow={(item) => (
              <CollectionPreviewRow
                key={item.id}
                item={item}
                icon={item.representative.icon ?? "heart"}
                title={item.representative.promptText}
                secondary={getLibraryPersonalSecondary(item.representative, timezone)}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                onOpen={() => openSpecificReveal(item.id)}
                menuActions={personalActions(item)}
              />
            )}
          />
        </section>

        <section className="library-section-group">
          <ExpandableCollection
            id="commitment-card-section"
            icon="star"
            title="Commitment Cards"
            description="Promises you've made to yourself."
            countLabel={commitmentCountLabel}
            items={commitmentItems}
            isOpen={commitmentsOpen}
            onToggle={() => toggleSection("commitments")}
            onAdd={onCreateCommitment}
            addLabel="Create commitment card"
            testId="library-commitment-section"
            emptyLabel="No commitment cards yet"
            renderRow={(item) => (
              <CollectionPreviewRow
                key={item.id}
                item={item}
                icon={item.representative.icon ?? "star"}
                title={item.representative.promptText}
                secondary={getLibraryCommitmentSecondary(item.representative)}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                onOpen={() => openSpecificReveal(item.id)}
                menuActions={personalActions(item)}
              />
            )}
          />
        </section>

        <section className="library-section-group">
          <ExpandableCollection
            id="active-pack-section"
            icon="book"
            title="Active Packs"
            description="Packs you've added to your library."
            countLabel={activePackCountLabel}
            items={activePackItems}
            isOpen={activePacksOpen}
            onToggle={() => toggleSection("activePacks")}
            onAdd={onAddPack}
            addLabel="Add active pack"
            testId="library-active-packs-section"
            emptyLabel="No active packs yet"
            renderRow={(item) => {
              const pack = libraryPacks.find((candidate) => candidate.id === item.id || candidate.sourceKey === item.id);
              return (
                <CollectionPreviewRow
                  key={item.id}
                  item={item}
                  icon={item.representative.icon ?? "book"}
                  art={pack ? (
                    <GeneratedPackCover pack={pack} variant="thumb" className="library-pack-thumb" isActive />
                  ) : null}
                  title={item.representative.promptText}
                  secondary={getLibraryPackSecondary(item)}
                  menuOpenId={menuOpenId}
                  setMenuOpenId={setMenuOpenId}
                  onOpen={() => openPackReveal(item.id)}
                  menuActions={packActions(item)}
                />
              );
            }}
          />
        </section>

        <section className="library-section-group">
          <ExpandableCollection
            id="do-instead-card-section"
            icon="star"
            title="Do Instead Cards"
            description="Things to do instead of opening an app."
            countLabel={doInsteadCountLabel}
            items={doInsteadItems}
            isOpen={doInsteadOpen}
            onToggle={() => toggleSection("doInstead")}
            onAdd={onCreateActionCard}
            addLabel="Create Do Instead card"
            testId="library-do-instead-section"
            emptyLabel="No Do Instead cards yet"
            renderRow={(item) => (
              <CollectionPreviewRow
                key={item.id}
                item={item}
                icon="star"
                title={item.title}
                secondary={item.hidden ? "Hidden" : item.body || item.category || ""}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                onOpen={() => setMenuOpenId((current) => (current === item.id ? null : item.id))}
                menuActions={
                  item.source === "starter"
                    ? [{ label: item.hidden ? "Restore" : "Hide", onClick: () => onToggleActionCardHidden(item.id, !item.hidden) }]
                    : [{ label: "Delete", danger: true, onClick: () => onDeleteActionCard(item.id) }]
                }
              />
            )}
          />
        </section>
      </div>
    </section>
  );
}

// LogPanel → moved to src/components/LogPanel.jsx

