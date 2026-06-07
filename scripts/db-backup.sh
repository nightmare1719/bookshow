#!/bin/bash

# Database Backup Strategy script for MongoDB Atlas / Local MongoDB
# Run this on a daily cron schedule to secure platform transactions.

DB_NAME="ai_event_platform"
BACKUP_DIR="/var/backups/mongodb"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="${DB_NAME}_backup_${TIMESTAMP}"
S3_BUCKET="s3://ai-event-platform-backups/database"

# Create backup directory if it does not exist
mkdir -p "${BACKUP_DIR}"

echo "Starting MongoDB Backup for ${DB_NAME}..."

# Execute mongodump with compression
mongodump --db="${DB_NAME}" --out="${BACKUP_DIR}/${BACKUP_NAME}" --gzip

if [ $? -eq 0 ]; then
  echo "Backup successfully created at ${BACKUP_DIR}/${BACKUP_NAME}"
  
  # Archive the directory
  tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" -C "${BACKUP_DIR}" "${BACKUP_NAME}"
  rm -rf "${BACKUP_DIR}/${BACKUP_NAME}"
  
  echo "Compressed archive: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

  # Optional: Upload to AWS S3 storage (DevOps integration)
  # echo "Uploading archive to AWS S3 bucket: ${S3_BUCKET}"
  # aws s3 cp "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" "${S3_BUCKET}/${BACKUP_NAME}.tar.gz"

  # Rotate local backups: Delete backups older than 7 days
  echo "Cleaning up local backups older than 7 days..."
  find "${BACKUP_DIR}" -type f -name "*.tar.gz" -mtime +7 -delete
  
  echo "Database Backup Cycle Completed Successfully."
else
  echo "ERROR: MongoDB backup failed!" >&2
  exit 1
fi
