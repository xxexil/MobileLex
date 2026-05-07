// backend/models/message_read.js
module.exports = (sequelize, DataTypes) => {
  const MessageRead = sequelize.define('MessageRead', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    message_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    read_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    timestamps: false,
    tableName: 'message_reads',
    indexes: [{ unique: true, fields: ['message_id', 'user_id'] }],
  });

  MessageRead.associate = (models) => {
    MessageRead.belongsTo(models.Message, {
      foreignKey: 'message_id',
      as: 'message',
      onDelete: 'CASCADE',
    });
  };

  return MessageRead;
};
