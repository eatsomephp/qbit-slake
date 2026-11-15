import type { SelectOption, SettingField, SettingSection } from './types';

const relocateOrSwitchToManual = (subject: string): SelectOption[] => [
  { value: true, label: `Relocate ${subject}` },
  { value: false, label: `Switch ${subject} to manual mode` },
];

const PROGRAM_PLACEHOLDERS =
  '%N name, %L category, %G tags, %F content path, %R root path, %D save path, %C file count, %Z size in bytes, %T current tracker, %I info hash v1, %J info hash v2, %K torrent ID.';

const mailField = (field: Omit<SettingField, 'enabledBy'>): SettingField => ({
  ...field,
  enabledBy: 'mail_notification_enabled',
});

export const downloads: SettingSection = {
  id: 'downloads',
  title: 'Downloads',
  groups: [
    {
      title: 'When adding a torrent',
      fields: [
        {
          key: 'torrent_content_layout',
          label: 'Torrent content layout',
          kind: 'select',
          options: [
            { value: 'Original', label: 'Original' },
            { value: 'Subfolder', label: 'Create subfolder' },
            { value: 'NoSubfolder', label: "Don't create subfolder" },
          ],
        },
        { key: 'add_to_top_of_queue', label: 'Add to top of queue', kind: 'bool' },
        { key: 'add_stopped_enabled', label: 'Add torrents stopped', kind: 'bool' },
        {
          key: 'torrent_stop_condition',
          label: 'Torrent stop condition',
          kind: 'select',
          options: [
            { value: 'None', label: 'None' },
            { value: 'MetadataReceived', label: 'Metadata received' },
            { value: 'FilesChecked', label: 'Files checked' },
          ],
        },
        {
          key: 'merge_trackers',
          label: 'Merge trackers into duplicate torrents',
          hint: 'When adding a torrent that already exists.',
          kind: 'bool',
        },
        {
          key: 'auto_delete_mode',
          label: 'Delete .torrent file afterwards',
          kind: 'select',
          options: [
            { value: 0, label: 'Never' },
            { value: 1, label: 'When added' },
            { value: 2, label: 'Also when addition is cancelled' },
          ],
        },
      ],
    },
    {
      fields: [
        {
          key: 'preallocate_all',
          label: 'Pre-allocate disk space',
          hint: 'Allocates full file sizes before downloading to reduce fragmentation. Only useful for HDDs.',
          kind: 'bool',
        },
        {
          key: 'incomplete_files_ext',
          label: 'Append .!qB to incomplete files',
          kind: 'bool',
        },
        {
          key: 'use_unwanted_folder',
          label: 'Keep unselected files in a ".unwanted" folder',
          kind: 'bool',
        },
      ],
    },
    {
      title: 'Saving management',
      fields: [
        {
          key: 'auto_tmm_enabled',
          label: 'Automatic torrent management',
          hint: 'Category decides the save path.',
          kind: 'bool',
        },
        {
          key: 'torrent_changed_tmm_enabled',
          label: 'When a torrent’s category changes',
          kind: 'select',
          options: relocateOrSwitchToManual('torrent'),
        },
        {
          key: 'save_path_changed_tmm_enabled',
          label: 'When the default save or incomplete path changes',
          kind: 'select',
          options: relocateOrSwitchToManual('affected torrents'),
        },
        {
          key: 'category_changed_tmm_enabled',
          label: 'When a category’s save path changes',
          kind: 'select',
          options: relocateOrSwitchToManual('affected torrents'),
        },
        { key: 'use_subcategories', label: 'Enable subcategories', kind: 'bool' },
        {
          key: 'use_category_paths_in_manual_mode',
          label: 'Use category paths in manual mode',
          hint: 'Resolve relative save paths against the category path instead of the default one.',
          kind: 'bool',
        },
        { key: 'save_path', label: 'Default save path', kind: 'path', showFreeSpace: true },
        {
          key: 'temp_path',
          label: 'Keep incomplete torrents in',
          kind: 'path',
          showFreeSpace: true,
          inlineToggle: 'temp_path_enabled',
          inlineToggleLabel: 'Use a folder for incomplete torrents',
        },
      ],
    },
    {
      title: 'Backup .torrent files',
      fields: [
        {
          key: 'torrent_files_backup_dir',
          label: 'Store backups in',
          kind: 'path',
          inlineToggle: 'torrent_files_backup_enabled',
          inlineToggleLabel: 'Store backup .torrent files',
        },
        {
          key: 'torrent_files_finished_backup_dir',
          label: 'When finished, move backups to',
          kind: 'path',
          inlineToggle: 'torrent_files_finished_backup_dir_enabled',
          inlineToggleLabel: 'Move backups of finished torrents',
          enabledBy: 'torrent_files_backup_enabled',
        },
        {
          key: 'remove_torrent_file_backup',
          label: 'Remove the backup when removing a torrent',
          kind: 'bool',
          enabledBy: 'torrent_files_backup_enabled',
        },
      ],
    },
    {
      title: 'Watched folders',
      fields: [
        {
          key: 'scan_dirs',
          label: 'Automatically add torrents from',
          hint: '.torrent files dropped into these folders are added.',
          kind: 'scanDirs',
        },
      ],
    },
    {
      title: 'Excluded files',
      fields: [
        {
          key: 'excluded_file_names',
          label: 'Excluded file names',
          hint: 'One pattern per line, e.g. *.nfo. Matching files are set to "Do not download".',
          kind: 'multiline',
          inlineToggle: 'excluded_file_names_enabled',
          inlineToggleLabel: 'Exclude file names',
        },
        {
          key: 'exclude_files_without_extension',
          label: 'Exclude files without an extension',
          hint: 'For example "readme" or "setup.".',
          kind: 'bool',
        },
      ],
    },
    {
      title: 'Email notification on download completion',
      fields: [
        { key: 'mail_notification_enabled', label: 'Send an email', kind: 'bool' },
        mailField({ key: 'mail_notification_sender', label: 'From', kind: 'text' }),
        mailField({ key: 'mail_notification_email', label: 'To', kind: 'text' }),
        mailField({ key: 'mail_notification_smtp', label: 'SMTP server', kind: 'text' }),
        mailField({
          key: 'mail_notification_encryption_type',
          label: 'SMTP encryption',
          kind: 'select',
          options: [
            { value: 'None', label: 'None' },
            { value: 'STARTTLS', label: 'STARTTLS' },
            { value: 'SMTPS', label: 'SMTPS' },
          ],
        }),
        mailField({
          key: 'mail_notification_auth_enabled',
          label: 'Authentication',
          kind: 'bool',
        }),
        {
          key: 'mail_notification_username',
          label: 'Username',
          kind: 'text',
          enabledBy: 'mail_notification_auth_enabled',
        },
        {
          key: 'mail_notification_password',
          label: 'Password',
          kind: 'secret',
          enabledBy: 'mail_notification_auth_enabled',
        },
      ],
    },
    {
      title: 'Run external program',
      hint: `Placeholders: ${PROGRAM_PLACEHOLDERS}`,
      fields: [
        {
          key: 'autorun_on_torrent_added_program',
          label: 'Run on torrent added',
          kind: 'text',
          inlineToggle: 'autorun_on_torrent_added_enabled',
          inlineToggleLabel: 'Run a program when a torrent is added',
        },
        {
          key: 'autorun_program',
          label: 'Run on torrent finished',
          kind: 'text',
          inlineToggle: 'autorun_enabled',
          inlineToggleLabel: 'Run a program when a torrent finishes',
        },
      ],
    },
    {
      title: 'Torrent removal',
      fields: [
        {
          key: 'torrent_content_remove_option',
          label: 'When deleting files',
          hint: 'Applies whenever torrents are removed with their files, including from this UI.',
          kind: 'select',
          options: [
            { value: 'Delete', label: 'Delete permanently' },
            { value: 'MoveToTrash', label: 'Move to trash (if possible)' },
          ],
        },
      ],
    },
  ],
};
