// Message model for Sequelize
module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sender_id: { type: DataTypes.INTEGER, allowNull: false },
    recipient_id: { type: DataTypes.INTEGER }, // nullable for group
    group_id: { type: DataTypes.INTEGER }, // nullable for 1:1
    content: { type: DataTypes.TEXT, allowNull: false },
    delivered: { type: DataTypes.BOOLEAN, defaultValue: false },
    read: { type: DataTypes.BOOLEAN, defaultValue: false },
    delivered_at: { type: DataTypes.DATE },
    read_at: { type: DataTypes.DATE },
    type: { type: DataTypes.STRING, defaultValue: 'text' }, // 'text', 'image', 'video', 'file'
    media_url: { type: DataTypes.STRING },
    reactions: { type: DataTypes.TEXT }, // JSON string
  }, {
    timestamps: true,
    tableName: 'messages',
  });

  Message.associate = (models) => {
    Message.hasMany(models.MessageRead, {
      foreignKey: 'message_id',
      as: 'reads',
      onDelete: 'CASCADE',
    });
  };

  return Message;
};
