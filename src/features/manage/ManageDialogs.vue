<script setup lang="ts">
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import qbit from '@/services/qbit';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import CategoryDialog from './CategoryDialog.vue';
import TagsDialog from './TagsDialog.vue';
import LocationDialog from './LocationDialog.vue';
import DownloadPathDialog from './DownloadPathDialog.vue';
import RenameDialog from './RenameDialog.vue';
import CommentDialog from './CommentDialog.vue';
import ReplaceTrackerDialog from './ReplaceTrackerDialog.vue';
import SpeedLimitsDialog from './SpeedLimitsDialog.vue';
import ShareLimitsDialog from './ShareLimitsDialog.vue';
import ShortcutsDialog from './ShortcutsDialog.vue';
import StatisticsDialog from './StatisticsDialog.vue';
import TrackerStatisticsDialog from './TrackerStatisticsDialog.vue';
import ViewNameDialog from './ViewNameDialog.vue';
import { closeManage, manage } from './manageState';

const actions = useTorrentActions();

async function removeCategory(name: string) {
  if (await actions.perform('Remove category', () => qbit.removeCategories([name]))) closeManage();
}

async function enableAutoTmm(hashes: string[]) {
  closeManage();
  await actions.setAutoManagement(hashes, true);
}

async function deleteTag(name: string) {
  if (await actions.perform('Delete tag', () => qbit.deleteTags([name]))) closeManage();
}
</script>

<template>
  <template v-if="manage">
    <CategoryDialog
      v-if="manage.kind === 'category'"
      :edit="manage.edit"
      :parent="manage.parent"
      :apply-to="manage.applyTo"
    />
    <TagsDialog v-else-if="manage.kind === 'tags'" :apply-to="manage.applyTo" />
    <LocationDialog v-else-if="manage.kind === 'location'" :hashes="manage.hashes" />
    <DownloadPathDialog v-else-if="manage.kind === 'downloadPath'" :hashes="manage.hashes" />
    <RenameDialog v-else-if="manage.kind === 'rename'" :hash="manage.hash" />
    <CommentDialog v-else-if="manage.kind === 'comment'" :hashes="manage.hashes" />
    <ReplaceTrackerDialog
      v-else-if="manage.kind === 'replaceTracker'"
      :hashes="manage.hashes"
      :find="manage.find"
    />
    <SpeedLimitsDialog v-else-if="manage.kind === 'speedLimits'" :hashes="manage.hashes" />
    <ShareLimitsDialog v-else-if="manage.kind === 'shareLimits'" :hashes="manage.hashes" />
    <ShortcutsDialog v-else-if="manage.kind === 'shortcuts'" :keymaps="manage.keymaps" />
    <StatisticsDialog v-else-if="manage.kind === 'statistics'" />
    <TrackerStatisticsDialog v-else-if="manage.kind === 'trackerStatistics'" />
    <ViewNameDialog v-else-if="manage.kind === 'saveView'" />
    <ViewNameDialog v-else-if="manage.kind === 'renameView'" :rename-id="manage.id" />
    <AlertDialog
      v-else-if="manage.kind === 'removeCategory'"
      :open="true"
      :title="`Remove category “${manage.name}”?`"
      description="Torrents in it become uncategorized. No files are moved or deleted."
      @update:open="closeManage"
    >
      <template #actions>
        <Button variant="outline" @click="closeManage">Cancel</Button>
        <Button variant="destructive" @click="removeCategory(manage.name)">Remove category</Button>
      </template>
    </AlertDialog>
    <AlertDialog
      v-else-if="manage.kind === 'enableAutoTmm'"
      :open="true"
      title="Enable automatic torrent management?"
      description="qBittorrent will move each torrent's files to the save path set by its category, or the default save path if it has none."
      @update:open="closeManage"
    >
      <template #actions>
        <Button variant="outline" @click="closeManage">Cancel</Button>
        <Button @click="enableAutoTmm(manage.hashes)">Enable</Button>
      </template>
    </AlertDialog>
    <AlertDialog
      v-else-if="manage.kind === 'deleteTag'"
      :open="true"
      :title="`Delete tag “${manage.name}”?`"
      description="It is removed from every torrent that has it."
      @update:open="closeManage"
    >
      <template #actions>
        <Button variant="outline" @click="closeManage">Cancel</Button>
        <Button variant="destructive" @click="deleteTag(manage.name)">Delete tag</Button>
      </template>
    </AlertDialog>
  </template>
</template>
