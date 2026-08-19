-- Mekyro MySQL current complete schema and baseline data
-- Generated from the active RDS database on 2026-08-19.
-- Contains 32 tables, Chinese table/column comments, the platform administrator,
-- the Shanghai Mangkeyi workspace and its owner membership. Business tables are empty.
-- UUID identifiers and Alembic version 0004_lead_platform_name are preserved.

-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
--
-- Host: rm-uf6tvw7o6v6f39ktueo.mysql.rds.aliyuncs.com    Database: mekyro
-- ------------------------------------------------------
-- Server version	8.0.36

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `agent_approvals`
--

DROP TABLE IF EXISTS `agent_approvals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_approvals` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `execution_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'Agent 执行 UUID',
  `requested_by` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '发起用户 UUID',
  `decided_by` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '审批用户 UUID',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '审批状态',
  `summary` varchar(500) COLLATE utf8mb4_bin NOT NULL COMMENT '摘要说明',
  `expires_at` datetime NOT NULL COMMENT '过期时间',
  `decided_at` datetime DEFAULT NULL COMMENT '审批决定时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `execution_id` (`execution_id`),
  KEY `decided_by` (`decided_by`),
  KEY `idx_agent_approval_workspace_status` (`workspace_id`,`status`),
  KEY `ix_agent_approvals_execution_id` (`execution_id`),
  KEY `ix_agent_approvals_requested_by` (`requested_by`),
  KEY `ix_agent_approvals_status` (`status`),
  KEY `ix_agent_approvals_workspace_id` (`workspace_id`),
  CONSTRAINT `agent_approvals_ibfk_1` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `agent_approvals_ibfk_2` FOREIGN KEY (`execution_id`) REFERENCES `agent_executions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `agent_approvals_ibfk_3` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `agent_approvals_ibfk_4` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Agent 高风险操作审批记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agent_approvals`
--

LOCK TABLES `agent_approvals` WRITE;
/*!40000 ALTER TABLE `agent_approvals` DISABLE KEYS */;
/*!40000 ALTER TABLE `agent_approvals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `agent_conversations`
--

DROP TABLE IF EXISTS `agent_conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_conversations` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `user_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联用户 UUID',
  `title` varchar(200) COLLATE utf8mb4_bin NOT NULL COMMENT '标题',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '会话状态',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_agent_conversation_workspace_user` (`workspace_id`,`user_id`),
  KEY `ix_agent_conversations_status` (`status`),
  KEY `ix_agent_conversations_user_id` (`user_id`),
  KEY `ix_agent_conversations_workspace_id` (`workspace_id`),
  CONSTRAINT `agent_conversations_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `agent_conversations_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Agent 对话会话';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agent_conversations`
--

LOCK TABLES `agent_conversations` WRITE;
/*!40000 ALTER TABLE `agent_conversations` DISABLE KEYS */;
/*!40000 ALTER TABLE `agent_conversations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `agent_executions`
--

DROP TABLE IF EXISTS `agent_executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_executions` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `conversation_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'Agent 会话 UUID',
  `requested_by` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '发起用户 UUID',
  `execution_key` varchar(128) COLLATE utf8mb4_bin NOT NULL COMMENT 'Agent 执行幂等键',
  `tool_name` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT 'Agent 工具名称',
  `tool_input` json NOT NULL COMMENT 'Agent 工具输入 JSON',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '执行状态',
  `attempt_count` int NOT NULL COMMENT 'Agent 执行尝试次数',
  `result_payload` json NOT NULL COMMENT 'Agent 执行结果 JSON',
  `error_code` varchar(80) COLLATE utf8mb4_bin NOT NULL COMMENT 'Agent 执行错误码',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspace_id` (`workspace_id`,`execution_key`),
  KEY `idx_agent_execution_conversation_status` (`conversation_id`,`status`),
  KEY `ix_agent_executions_conversation_id` (`conversation_id`),
  KEY `ix_agent_executions_requested_by` (`requested_by`),
  KEY `ix_agent_executions_status` (`status`),
  KEY `ix_agent_executions_workspace_id` (`workspace_id`),
  CONSTRAINT `agent_executions_ibfk_1` FOREIGN KEY (`conversation_id`) REFERENCES `agent_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `agent_executions_ibfk_2` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `agent_executions_ibfk_3` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Agent 工具执行记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agent_executions`
--

LOCK TABLES `agent_executions` WRITE;
/*!40000 ALTER TABLE `agent_executions` DISABLE KEYS */;
/*!40000 ALTER TABLE `agent_executions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `agent_messages`
--

DROP TABLE IF EXISTS `agent_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_messages` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `conversation_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'Agent 会话 UUID',
  `role` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '消息角色：user、assistant 或 tool',
  `content` text COLLATE utf8mb4_bin NOT NULL COMMENT '消息文本内容',
  `event_type` varchar(50) COLLATE utf8mb4_bin NOT NULL COMMENT '消息事件类型',
  `event_payload` json NOT NULL COMMENT '消息事件载荷 JSON',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_agent_message_conversation_created` (`conversation_id`,`created_at`),
  KEY `ix_agent_messages_conversation_id` (`conversation_id`),
  CONSTRAINT `agent_messages_ibfk_1` FOREIGN KEY (`conversation_id`) REFERENCES `agent_conversations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Agent 对话消息与事件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agent_messages`
--

LOCK TABLES `agent_messages` WRITE;
/*!40000 ALTER TABLE `agent_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `agent_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `alembic_version`
--

DROP TABLE IF EXISTS `alembic_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alembic_version` (
  `version_num` varchar(32) COLLATE utf8mb4_bin NOT NULL COMMENT 'Alembic 迁移版本号',
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Alembic 数据库版本';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alembic_version`
--

LOCK TABLES `alembic_version` WRITE;
/*!40000 ALTER TABLE `alembic_version` DISABLE KEYS */;
INSERT INTO `alembic_version` VALUES ('0004_lead_platform_name');
/*!40000 ALTER TABLE `alembic_version` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `api_keys`
--

DROP TABLE IF EXISTS `api_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `api_keys` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `user_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联用户 UUID',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `name` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT 'API Key 名称',
  `key_hash` varchar(64) COLLATE utf8mb4_bin NOT NULL COMMENT 'API Key 哈希',
  `key_prefix` varchar(12) COLLATE utf8mb4_bin NOT NULL COMMENT 'API Key 可识别前缀',
  `permissions` json NOT NULL COMMENT 'API 权限列表 JSON',
  `is_active` tinyint(1) NOT NULL COMMENT '是否启用',
  `last_used_at` datetime DEFAULT NULL COMMENT '最后使用时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `key_hash` (`key_hash`),
  KEY `idx_api_key_workspace_active` (`workspace_id`,`is_active`),
  KEY `ix_api_keys_is_active` (`is_active`),
  KEY `ix_api_keys_user_id` (`user_id`),
  KEY `ix_api_keys_workspace_id` (`workspace_id`),
  CONSTRAINT `api_keys_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `api_keys_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='工作区外部 API 密钥';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `api_keys`
--

LOCK TABLES `api_keys` WRITE;
/*!40000 ALTER TABLE `api_keys` DISABLE KEYS */;
/*!40000 ALTER TABLE `api_keys` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '所属工作区 UUID',
  `actor_user_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '操作用户 UUID',
  `action` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '审计动作名称',
  `entity_type` varchar(80) COLLATE utf8mb4_bin NOT NULL COMMENT '被操作实体类型',
  `entity_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '被操作实体 UUID',
  `payload` json NOT NULL COMMENT '事件或审计载荷 JSON',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `actor_user_id` (`actor_user_id`),
  KEY `idx_audit_workspace_created` (`workspace_id`,`created_at`),
  KEY `ix_audit_logs_action` (`action`),
  KEY `ix_audit_logs_workspace_id` (`workspace_id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `audit_logs_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='平台与工作区审计日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_challenges`
--

DROP TABLE IF EXISTS `auth_challenges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_challenges` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `channel` varchar(20) COLLATE utf8mb4_bin NOT NULL COMMENT '渠道类型',
  `target` varchar(254) COLLATE utf8mb4_bin NOT NULL COMMENT '验证码接收目标',
  `purpose` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '验证码用途',
  `code_hash` varchar(64) COLLATE utf8mb4_bin NOT NULL COMMENT '验证码哈希',
  `ip_address` varchar(64) COLLATE utf8mb4_bin NOT NULL COMMENT '请求来源 IP',
  `captcha_verified` tinyint(1) NOT NULL COMMENT '是否通过人机验证',
  `failed_attempts` int NOT NULL COMMENT '失败尝试次数',
  `expires_at` datetime NOT NULL COMMENT '过期时间',
  `used_at` datetime DEFAULT NULL COMMENT '验证码使用时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_auth_challenge_ip_created` (`ip_address`,`created_at`),
  KEY `idx_auth_challenge_target_created` (`channel`,`target`,`created_at`),
  KEY `ix_auth_challenges_channel` (`channel`),
  KEY `ix_auth_challenges_target` (`target`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='短信和邮箱验证码挑战';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_challenges`
--

LOCK TABLES `auth_challenges` WRITE;
/*!40000 ALTER TABLE `auth_challenges` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_challenges` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `buyer_inquiries`
--

DROP TABLE IF EXISTS `buyer_inquiries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `buyer_inquiries` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `assigned_workspace_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '分配的工作区 UUID',
  `company_name` varchar(200) COLLATE utf8mb4_bin NOT NULL COMMENT '公司名称',
  `required_product` varchar(500) COLLATE utf8mb4_bin NOT NULL COMMENT '采购产品需求',
  `country` varchar(5) COLLATE utf8mb4_bin NOT NULL COMMENT '国家或地区代码',
  `contact_name` varchar(150) COLLATE utf8mb4_bin NOT NULL COMMENT '联系人姓名',
  `phone` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '联系电话',
  `email` varchar(254) COLLATE utf8mb4_bin NOT NULL COMMENT '电子邮箱',
  `remark` text COLLATE utf8mb4_bin NOT NULL COMMENT '备注',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '买家询盘状态',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `ix_buyer_inquiries_assigned_workspace_id` (`assigned_workspace_id`),
  CONSTRAINT `buyer_inquiries_ibfk_1` FOREIGN KEY (`assigned_workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='官网买家询盘';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `buyer_inquiries`
--

LOCK TABLES `buyer_inquiries` WRITE;
/*!40000 ALTER TABLE `buyer_inquiries` DISABLE KEYS */;
/*!40000 ALTER TABLE `buyer_inquiries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `parent_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '父分类 UUID',
  `name` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '分类名称',
  `sort_order` int NOT NULL COMMENT '排序序号',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspace_id` (`workspace_id`,`parent_id`,`name`),
  KEY `parent_id` (`parent_id`),
  KEY `ix_categories_workspace_id` (`workspace_id`),
  CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `categories_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='工作区商品分类';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categories`
--

LOCK TABLES `categories` WRITE;
/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contact_activities`
--

DROP TABLE IF EXISTS `contact_activities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contact_activities` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `lead_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联线索 UUID',
  `activity_type` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '联系活动类型',
  `direction` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '联系方向',
  `channel` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '渠道类型',
  `subject` varchar(500) COLLATE utf8mb4_bin NOT NULL COMMENT '联系主题',
  `sender` varchar(254) COLLATE utf8mb4_bin NOT NULL COMMENT '发送方',
  `recipient` varchar(254) COLLATE utf8mb4_bin NOT NULL COMMENT '接收方',
  `content` text COLLATE utf8mb4_bin NOT NULL COMMENT '正文内容',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_activity_workspace_created` (`workspace_id`,`created_at`),
  KEY `ix_contact_activities_lead_id` (`lead_id`),
  KEY `ix_contact_activities_workspace_id` (`workspace_id`),
  CONSTRAINT `contact_activities_ibfk_1` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `contact_activities_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='线索联系与跟进记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contact_activities`
--

LOCK TABLES `contact_activities` WRITE;
/*!40000 ALTER TABLE `contact_activities` DISABLE KEYS */;
/*!40000 ALTER TABLE `contact_activities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `idempotency_records`
--

DROP TABLE IF EXISTS `idempotency_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `idempotency_records` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `scope` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '幂等业务范围',
  `key` varchar(128) COLLATE utf8mb4_bin NOT NULL COMMENT '幂等键',
  `request_hash` varchar(64) COLLATE utf8mb4_bin NOT NULL COMMENT '请求内容哈希',
  `response_payload` json NOT NULL COMMENT '缓存响应 JSON',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspace_id` (`workspace_id`,`scope`,`key`),
  KEY `ix_idempotency_records_workspace_id` (`workspace_id`),
  CONSTRAINT `idempotency_records_ibfk_1` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='接口幂等请求记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `idempotency_records`
--

LOCK TABLES `idempotency_records` WRITE;
/*!40000 ALTER TABLE `idempotency_records` DISABLE KEYS */;
/*!40000 ALTER TABLE `idempotency_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_movements`
--

DROP TABLE IF EXISTS `inventory_movements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_movements` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `variant_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联 SKU UUID',
  `movement_type` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '库存变动类型',
  `quantity_delta` int NOT NULL COMMENT '库存增减数量',
  `balance_after` int NOT NULL COMMENT '变动后库存余额',
  `reason` varchar(500) COLLATE utf8mb4_bin NOT NULL COMMENT '变动原因',
  `reference` varchar(120) COLLATE utf8mb4_bin NOT NULL COMMENT '外部参考编号',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `created_by` varchar(100) COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '创建人标识',
  PRIMARY KEY (`id`),
  KEY `idx_inventory_workspace_created` (`workspace_id`,`created_at`),
  KEY `ix_inventory_movements_variant_id` (`variant_id`),
  KEY `ix_inventory_movements_workspace_id` (`workspace_id`),
  CONSTRAINT `inventory_movements_ibfk_1` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `inventory_movements_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='SKU 库存变动流水';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_movements`
--

LOCK TABLES `inventory_movements` WRITE;
/*!40000 ALTER TABLE `inventory_movements` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_movements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `leads`
--

DROP TABLE IF EXISTS `leads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leads` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `source` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '线索来源',
  `external_ref` varchar(120) COLLATE utf8mb4_bin NOT NULL COMMENT '外部系统引用编号',
  `merchant_name` varchar(200) COLLATE utf8mb4_bin NOT NULL COMMENT '商户名称',
  `company_name` varchar(200) COLLATE utf8mb4_bin NOT NULL COMMENT '公司名称',
  `contact_person` varchar(150) COLLATE utf8mb4_bin NOT NULL COMMENT '线索联系人',
  `country` varchar(5) COLLATE utf8mb4_bin NOT NULL COMMENT '国家或地区代码',
  `city` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '城市',
  `zip_code` varchar(20) COLLATE utf8mb4_bin NOT NULL COMMENT '邮政编码',
  `description` text COLLATE utf8mb4_bin NOT NULL COMMENT '线索背景描述',
  `email` varchar(254) COLLATE utf8mb4_bin NOT NULL COMMENT '电子邮箱',
  `phone` varchar(50) COLLATE utf8mb4_bin NOT NULL COMMENT '联系电话',
  `country_code` varchar(10) COLLATE utf8mb4_bin NOT NULL COMMENT '国际电话区号',
  `whatsapp` varchar(50) COLLATE utf8mb4_bin NOT NULL COMMENT 'WhatsApp 联系方式',
  `stage` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '线索跟进阶段',
  `recommendation_score` int NOT NULL COMMENT 'AI 推荐评分',
  `recommendation_reason` text COLLATE utf8mb4_bin NOT NULL COMMENT 'AI 推荐原因',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  `platform_name` varchar(100) COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '线索平台名称，例如 WhatsApp、LinkedIn',
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspace_id` (`workspace_id`,`source`,`external_ref`),
  KEY `idx_lead_workspace_stage` (`workspace_id`,`stage`),
  KEY `ix_leads_workspace_id` (`workspace_id`),
  CONSTRAINT `leads_ibfk_1` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='工作区销售线索';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leads`
--

LOCK TABLES `leads` WRITE;
/*!40000 ALTER TABLE `leads` DISABLE KEYS */;
/*!40000 ALTER TABLE `leads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_items`
--

DROP TABLE IF EXISTS `order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_items` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `order_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联订单 UUID',
  `variant_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联 SKU UUID',
  `quantity` int NOT NULL COMMENT '数量',
  `unit_price` decimal(12,2) NOT NULL COMMENT '单价',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `ix_order_items_order_id` (`order_id`),
  KEY `ix_order_items_variant_id` (`variant_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='订单明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_items`
--

LOCK TABLES `order_items` WRITE;
/*!40000 ALTER TABLE `order_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `lead_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '关联线索 UUID',
  `order_number` varchar(60) COLLATE utf8mb4_bin NOT NULL COMMENT '订单编号',
  `total_amount` decimal(14,2) NOT NULL COMMENT '总金额',
  `currency` varchar(3) COLLATE utf8mb4_bin NOT NULL COMMENT 'ISO 货币代码',
  `order_status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '订单状态',
  `payment_status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '付款状态',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspace_id` (`workspace_id`,`order_number`),
  KEY `lead_id` (`lead_id`),
  KEY `ix_orders_workspace_id` (`workspace_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE SET NULL,
  CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='销售订单';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `outbox_messages`
--

DROP TABLE IF EXISTS `outbox_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `outbox_messages` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `topic` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '事件主题',
  `aggregate_type` varchar(80) COLLATE utf8mb4_bin NOT NULL COMMENT '聚合实体类型',
  `aggregate_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '聚合实体 UUID',
  `deduplication_key` varchar(200) COLLATE utf8mb4_bin NOT NULL COMMENT '消息去重键',
  `payload` json NOT NULL COMMENT '事件或审计载荷 JSON',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '消息处理状态',
  `attempts` int NOT NULL COMMENT '处理尝试次数',
  `available_at` datetime NOT NULL COMMENT '可处理时间',
  `processed_at` datetime DEFAULT NULL COMMENT '处理完成时间',
  `last_error` text COLLATE utf8mb4_bin NOT NULL COMMENT '最后一次错误信息',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `deduplication_key` (`deduplication_key`),
  KEY `idx_outbox_status_available` (`status`,`available_at`),
  KEY `ix_outbox_messages_status` (`status`),
  KEY `ix_outbox_messages_topic` (`topic`),
  KEY `ix_outbox_messages_workspace_id` (`workspace_id`),
  CONSTRAINT `outbox_messages_ibfk_1` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='异步事件发件箱';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outbox_messages`
--

LOCK TABLES `outbox_messages` WRITE;
/*!40000 ALTER TABLE `outbox_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `outbox_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `price_tiers`
--

DROP TABLE IF EXISTS `price_tiers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `price_tiers` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `variant_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联 SKU UUID',
  `minimum_quantity` int NOT NULL COMMENT '阶梯价起订数量',
  `unit_price` decimal(12,2) NOT NULL COMMENT '单价',
  PRIMARY KEY (`id`),
  UNIQUE KEY `variant_id` (`variant_id`,`minimum_quantity`),
  KEY `ix_price_tiers_variant_id` (`variant_id`),
  CONSTRAINT `price_tiers_ibfk_1` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='SKU 阶梯价格';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `price_tiers`
--

LOCK TABLES `price_tiers` WRITE;
/*!40000 ALTER TABLE `price_tiers` DISABLE KEYS */;
/*!40000 ALTER TABLE `price_tiers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_images`
--

DROP TABLE IF EXISTS `product_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_images` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `product_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '关联商品 UUID',
  `variant_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '关联 SKU UUID',
  `image_type` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '图片类型',
  `file_key` varchar(2000) COLLATE utf8mb4_bin NOT NULL COMMENT '对象存储文件键或 URL',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_product_image_product_type` (`product_id`,`image_type`),
  KEY `idx_product_image_variant` (`variant_id`),
  CONSTRAINT `product_images_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `product_images_ibfk_2` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_product_image_single_owner` CHECK ((((`product_id` is not null) and (`variant_id` is null)) or ((`product_id` is null) and (`variant_id` is not null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='商品和 SKU 图片';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_images`
--

LOCK TABLES `product_images` WRITE;
/*!40000 ALTER TABLE `product_images` DISABLE KEYS */;
/*!40000 ALTER TABLE `product_images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_variants`
--

DROP TABLE IF EXISTS `product_variants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_variants` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `product_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联商品 UUID',
  `sku_code` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT 'SKU 唯一编码',
  `specifications` json NOT NULL COMMENT 'SKU 规格 JSON',
  `minimum_order_quantity` int NOT NULL COMMENT '最小起订量',
  `currency` varchar(3) COLLATE utf8mb4_bin NOT NULL COMMENT 'ISO 货币代码',
  `stock_quantity` int NOT NULL COMMENT '当前库存数量',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT 'SKU 上下架状态',
  `external_ids` json NOT NULL COMMENT '外部系统 ID 映射 JSON',
  `is_deleted` tinyint(1) NOT NULL COMMENT '是否已软删除',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspace_id` (`workspace_id`,`sku_code`),
  KEY `ix_product_variants_product_id` (`product_id`),
  KEY `ix_product_variants_workspace_id` (`workspace_id`),
  CONSTRAINT `product_variants_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `product_variants_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='商品 SKU';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_variants`
--

LOCK TABLES `product_variants` WRITE;
/*!40000 ALTER TABLE `product_variants` DISABLE KEYS */;
/*!40000 ALTER TABLE `product_variants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `category_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '商品分类 UUID',
  `name` varchar(200) COLLATE utf8mb4_bin NOT NULL COMMENT '商品名称',
  `description` text COLLATE utf8mb4_bin NOT NULL COMMENT '描述信息',
  `specification_template` json NOT NULL COMMENT '商品规格模板 JSON',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '商品状态',
  `external_ids` json NOT NULL COMMENT '外部系统 ID 映射 JSON',
  `is_deleted` tinyint(1) NOT NULL COMMENT '是否已软删除',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  KEY `ix_products_workspace_id` (`workspace_id`),
  CONSTRAINT `products_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `products_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='工作区商品';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quote_items`
--

DROP TABLE IF EXISTS `quote_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_items` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `quote_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联报价单 UUID',
  `variant_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联 SKU UUID',
  `sku_code` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT 'SKU 唯一编码',
  `product_name` varchar(200) COLLATE utf8mb4_bin NOT NULL COMMENT '商品名称快照',
  `description` varchar(500) COLLATE utf8mb4_bin NOT NULL COMMENT '报价明细说明',
  `quantity` int NOT NULL COMMENT '数量',
  `unit_price` decimal(12,2) NOT NULL COMMENT '单价',
  `line_total` decimal(14,2) NOT NULL COMMENT '明细总价',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `ix_quote_items_quote_id` (`quote_id`),
  KEY `ix_quote_items_variant_id` (`variant_id`),
  CONSTRAINT `quote_items_ibfk_1` FOREIGN KEY (`quote_id`) REFERENCES `quotes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `quote_items_ibfk_2` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='报价单明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quote_items`
--

LOCK TABLES `quote_items` WRITE;
/*!40000 ALTER TABLE `quote_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `quote_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quote_versions`
--

DROP TABLE IF EXISTS `quote_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_versions` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `quote_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联报价单 UUID',
  `version_number` int NOT NULL COMMENT '报价版本号',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '该报价版本状态',
  `currency` varchar(3) COLLATE utf8mb4_bin NOT NULL COMMENT 'ISO 货币代码',
  `valid_until` date NOT NULL COMMENT '报价有效期',
  `subtotal_amount` decimal(14,2) NOT NULL COMMENT '商品小计金额',
  `discount_amount` decimal(14,2) NOT NULL COMMENT '优惠金额',
  `tax_amount` decimal(14,2) NOT NULL COMMENT '税费金额',
  `shipping_amount` decimal(14,2) NOT NULL COMMENT '运费金额',
  `total_amount` decimal(14,2) NOT NULL COMMENT '总金额',
  `notes` text COLLATE utf8mb4_bin NOT NULL COMMENT '备注说明',
  `terms` text COLLATE utf8mb4_bin NOT NULL COMMENT '交易条款',
  `items_snapshot` json NOT NULL COMMENT '报价明细快照 JSON',
  `created_by` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '创建人标识',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `quote_id` (`quote_id`,`version_number`),
  KEY `ix_quote_versions_quote_id` (`quote_id`),
  CONSTRAINT `quote_versions_ibfk_1` FOREIGN KEY (`quote_id`) REFERENCES `quotes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='报价单历史版本';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quote_versions`
--

LOCK TABLES `quote_versions` WRITE;
/*!40000 ALTER TABLE `quote_versions` DISABLE KEYS */;
/*!40000 ALTER TABLE `quote_versions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quotes`
--

DROP TABLE IF EXISTS `quotes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotes` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `lead_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '关联线索 UUID',
  `buyer_inquiry_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '关联买家询盘 UUID',
  `order_id` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '关联订单 UUID',
  `quote_number` varchar(55) COLLATE utf8mb4_bin NOT NULL COMMENT '报价单编号',
  `customer_name` varchar(200) COLLATE utf8mb4_bin NOT NULL COMMENT '客户名称',
  `customer_email` varchar(254) COLLATE utf8mb4_bin NOT NULL COMMENT '客户邮箱',
  `current_version` int NOT NULL COMMENT '当前报价版本号',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '报价单状态',
  `currency` varchar(3) COLLATE utf8mb4_bin NOT NULL COMMENT 'ISO 货币代码',
  `valid_until` date NOT NULL COMMENT '报价有效期',
  `subtotal_amount` decimal(14,2) NOT NULL COMMENT '商品小计金额',
  `discount_amount` decimal(14,2) NOT NULL COMMENT '优惠金额',
  `tax_amount` decimal(14,2) NOT NULL COMMENT '税费金额',
  `shipping_amount` decimal(14,2) NOT NULL COMMENT '运费金额',
  `total_amount` decimal(14,2) NOT NULL COMMENT '总金额',
  `notes` text COLLATE utf8mb4_bin NOT NULL COMMENT '备注说明',
  `terms` text COLLATE utf8mb4_bin NOT NULL COMMENT '交易条款',
  `decision_note` text COLLATE utf8mb4_bin NOT NULL COMMENT '报价决策备注',
  `created_by` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '创建人标识',
  `sent_at` datetime DEFAULT NULL COMMENT '发送时间',
  `responded_at` datetime DEFAULT NULL COMMENT '客户响应时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspace_id` (`workspace_id`,`quote_number`),
  UNIQUE KEY `order_id` (`order_id`),
  KEY `idx_quote_workspace_status` (`workspace_id`,`status`),
  KEY `ix_quotes_buyer_inquiry_id` (`buyer_inquiry_id`),
  KEY `ix_quotes_lead_id` (`lead_id`),
  KEY `ix_quotes_workspace_id` (`workspace_id`),
  CONSTRAINT `quotes_ibfk_1` FOREIGN KEY (`buyer_inquiry_id`) REFERENCES `buyer_inquiries` (`id`) ON DELETE SET NULL,
  CONSTRAINT `quotes_ibfk_2` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE SET NULL,
  CONSTRAINT `quotes_ibfk_3` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `quotes_ibfk_4` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_quote_discount_nonnegative` CHECK ((`discount_amount` >= 0)),
  CONSTRAINT `ck_quote_shipping_nonnegative` CHECK ((`shipping_amount` >= 0)),
  CONSTRAINT `ck_quote_subtotal_nonnegative` CHECK ((`subtotal_amount` >= 0)),
  CONSTRAINT `ck_quote_tax_nonnegative` CHECK ((`tax_amount` >= 0)),
  CONSTRAINT `ck_quote_total_nonnegative` CHECK ((`total_amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='客户报价单';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quotes`
--

LOCK TABLES `quotes` WRITE;
/*!40000 ALTER TABLE `quotes` DISABLE KEYS */;
/*!40000 ALTER TABLE `quotes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shipments`
--

DROP TABLE IF EXISTS `shipments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shipments` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `order_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联订单 UUID',
  `carrier` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '物流承运商',
  `tracking_number` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '物流单号',
  `shipped_at` datetime DEFAULT NULL COMMENT '发货时间',
  `shipping_status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '发货状态',
  `notes` text COLLATE utf8mb4_bin NOT NULL COMMENT '备注说明',
  `created_by` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '创建人标识',
  `updated_by` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '更新人标识',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `ix_shipments_order_id` (`order_id`),
  KEY `ix_shipments_workspace_id` (`workspace_id`),
  CONSTRAINT `shipments_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `shipments_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='订单发货记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shipments`
--

LOCK TABLES `shipments` WRITE;
/*!40000 ALTER TABLE `shipments` DISABLE KEYS */;
/*!40000 ALTER TABLE `shipments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shopify_configs`
--

DROP TABLE IF EXISTS `shopify_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shopify_configs` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `store_url` varchar(500) COLLATE utf8mb4_bin NOT NULL COMMENT 'Shopify 店铺地址',
  `api_version` varchar(20) COLLATE utf8mb4_bin NOT NULL COMMENT 'Shopify API 版本',
  `api_key_encrypted` text COLLATE utf8mb4_bin NOT NULL COMMENT '加密后的 Shopify API Key',
  `api_secret_encrypted` text COLLATE utf8mb4_bin NOT NULL COMMENT '加密后的 Shopify API Secret',
  `grant_type` varchar(50) COLLATE utf8mb4_bin NOT NULL COMMENT 'Shopify 授权模式',
  `is_active` tinyint(1) NOT NULL COMMENT '是否启用',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspace_id` (`workspace_id`),
  KEY `ix_shopify_configs_is_active` (`is_active`),
  KEY `ix_shopify_configs_workspace_id` (`workspace_id`),
  CONSTRAINT `shopify_configs_ibfk_1` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='工作区 Shopify 配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shopify_configs`
--

LOCK TABLES `shopify_configs` WRITE;
/*!40000 ALTER TABLE `shopify_configs` DISABLE KEYS */;
/*!40000 ALTER TABLE `shopify_configs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supplier_inquiries`
--

DROP TABLE IF EXISTS `supplier_inquiries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supplier_inquiries` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `company_name` varchar(200) COLLATE utf8mb4_bin NOT NULL COMMENT '公司名称',
  `main_business` varchar(500) COLLATE utf8mb4_bin NOT NULL COMMENT '主营业务',
  `country` varchar(5) COLLATE utf8mb4_bin NOT NULL COMMENT '国家或地区代码',
  `contact_name` varchar(150) COLLATE utf8mb4_bin NOT NULL COMMENT '联系人姓名',
  `phone` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '联系电话',
  `email` varchar(254) COLLATE utf8mb4_bin NOT NULL COMMENT '电子邮箱',
  `remark` text COLLATE utf8mb4_bin NOT NULL COMMENT '备注',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '供应商询盘状态',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='官网供应商入驻询盘';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplier_inquiries`
--

LOCK TABLES `supplier_inquiries` WRITE;
/*!40000 ALTER TABLE `supplier_inquiries` DISABLE KEYS */;
/*!40000 ALTER TABLE `supplier_inquiries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `username` varchar(150) COLLATE utf8mb4_bin NOT NULL COMMENT '登录用户名',
  `email` varchar(254) COLLATE utf8mb4_bin NOT NULL COMMENT '电子邮箱',
  `display_name` varchar(150) COLLATE utf8mb4_bin NOT NULL COMMENT '用户显示名称',
  `nickname` varchar(150) COLLATE utf8mb4_bin NOT NULL COMMENT '用户昵称',
  `country_code` varchar(10) COLLATE utf8mb4_bin NOT NULL COMMENT '国际电话区号',
  `phone` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '联系电话',
  `avatar` varchar(500) COLLATE utf8mb4_bin NOT NULL COMMENT '头像地址',
  `password_hash` varchar(255) COLLATE utf8mb4_bin NOT NULL COMMENT '密码安全哈希',
  `language` varchar(10) COLLATE utf8mb4_bin NOT NULL COMMENT '界面语言代码',
  `is_active` tinyint(1) NOT NULL COMMENT '是否启用',
  `is_platform_admin` tinyint(1) NOT NULL COMMENT '是否平台管理员',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_users_email` (`email`),
  UNIQUE KEY `ix_users_username` (`username`),
  KEY `ix_users_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='系统登录用户';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('e913607e-5ce0-4b93-9da2-3fb089d42ce7','mekyro','mekyro@mekyro.com','mekyro','mekyro','+86','','','$argon2id$v=19$m=65536,t=3,p=4$c95p0GpdIpW7uGY6Q9ZRDw$eWpJQL4edFKvrixCEw2pMI/iWuf0eTPtftfG5wrvlJs','zh-CN',1,1,'2026-08-19 01:36:42','2026-08-19 01:37:27');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workspace_invitations`
--

DROP TABLE IF EXISTS `workspace_invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workspace_invitations` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `email` varchar(254) COLLATE utf8mb4_bin NOT NULL COMMENT '电子邮箱',
  `role` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '角色标识',
  `token_prefix` varchar(20) COLLATE utf8mb4_bin NOT NULL COMMENT '邀请令牌前缀',
  `token_hash` varchar(64) COLLATE utf8mb4_bin NOT NULL COMMENT '邀请令牌哈希',
  `status` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '邀请状态',
  `expires_at` datetime NOT NULL COMMENT '过期时间',
  `invited_by` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '邀请发起用户 UUID',
  `accepted_by` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '接受邀请的用户 UUID',
  `accepted_at` datetime DEFAULT NULL COMMENT '邀请接受时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `accepted_by` (`accepted_by`),
  KEY `invited_by` (`invited_by`),
  KEY `idx_workspace_invitation_workspace_status` (`workspace_id`,`status`),
  KEY `ix_workspace_invitations_email` (`email`),
  KEY `ix_workspace_invitations_workspace_id` (`workspace_id`),
  CONSTRAINT `workspace_invitations_ibfk_1` FOREIGN KEY (`accepted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `workspace_invitations_ibfk_2` FOREIGN KEY (`invited_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `workspace_invitations_ibfk_3` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='工作区成员邀请';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workspace_invitations`
--

LOCK TABLES `workspace_invitations` WRITE;
/*!40000 ALTER TABLE `workspace_invitations` DISABLE KEYS */;
/*!40000 ALTER TABLE `workspace_invitations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workspace_members`
--

DROP TABLE IF EXISTS `workspace_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workspace_members` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `user_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '关联用户 UUID',
  `name` varchar(150) COLLATE utf8mb4_bin NOT NULL COMMENT '成员在工作区内的显示名称',
  `role` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '角色标识',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspace_id` (`workspace_id`,`user_id`),
  KEY `ix_workspace_members_user_id` (`user_id`),
  KEY `ix_workspace_members_workspace_id` (`workspace_id`),
  CONSTRAINT `workspace_members_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `workspace_members_ibfk_2` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='工作区成员关系';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workspace_members`
--

LOCK TABLES `workspace_members` WRITE;
/*!40000 ALTER TABLE `workspace_members` DISABLE KEYS */;
INSERT INTO `workspace_members` VALUES ('7b6d4f8e-2e6d-4b1b-9d0c-7e2d4a6f8c11','b108d4ab-f7a7-491f-bff6-285e31feb5c9','e913607e-5ce0-4b93-9da2-3fb089d42ce7','mekyro','owner','2026-08-19 10:10:45','2026-08-19 10:10:45');
/*!40000 ALTER TABLE `workspace_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workspace_prompt_versions`
--

DROP TABLE IF EXISTS `workspace_prompt_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workspace_prompt_versions` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `workspace_id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '所属工作区 UUID',
  `version` int NOT NULL COMMENT '版本号',
  `prompt` text COLLATE utf8mb4_bin NOT NULL COMMENT 'Agent 工作区提示词',
  `daily_lead_limit` int NOT NULL COMMENT '每日线索数量上限',
  `created_by` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT '创建人标识',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspace_id` (`workspace_id`,`version`),
  KEY `ix_workspace_prompt_versions_workspace_id` (`workspace_id`),
  CONSTRAINT `workspace_prompt_versions_ibfk_1` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='工作区 Agent 提示词版本';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workspace_prompt_versions`
--

LOCK TABLES `workspace_prompt_versions` WRITE;
/*!40000 ALTER TABLE `workspace_prompt_versions` DISABLE KEYS */;
/*!40000 ALTER TABLE `workspace_prompt_versions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workspaces`
--

DROP TABLE IF EXISTS `workspaces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workspaces` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL COMMENT 'UUID 主键',
  `name` varchar(200) COLLATE utf8mb4_bin NOT NULL COMMENT '名称',
  `slug` varchar(100) COLLATE utf8mb4_bin NOT NULL COMMENT '工作区唯一短标识',
  `description` text COLLATE utf8mb4_bin NOT NULL COMMENT '描述信息',
  `site_type` varchar(30) COLLATE utf8mb4_bin NOT NULL COMMENT '独立站类型：none、shopify、vendure 或 independent',
  `lead_acquisition_requirement` text COLLATE utf8mb4_bin NOT NULL COMMENT '长期获客需求原文',
  `prompt` text COLLATE utf8mb4_bin NOT NULL COMMENT 'Agent 工作区提示词',
  `prompt_version` int NOT NULL COMMENT '提示词当前版本号',
  `daily_lead_limit` int NOT NULL COMMENT '每日线索数量上限',
  `vendure_channels_token` varchar(255) COLLATE utf8mb4_bin NOT NULL COMMENT 'Vendure 渠道令牌',
  `vendure_url` varchar(500) COLLATE utf8mb4_bin NOT NULL COMMENT 'Vendure Admin API 地址',
  `onboarding_state` json NOT NULL COMMENT '入驻流程状态 JSON',
  `is_active` tinyint(1) NOT NULL COMMENT '是否启用',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  `email_outreach_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否启用邮件外展',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_workspaces_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='租户工作区与供应商配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workspaces`
--

LOCK TABLES `workspaces` WRITE;
/*!40000 ALTER TABLE `workspaces` DISABLE KEYS */;
INSERT INTO `workspaces` VALUES ('b108d4ab-f7a7-491f-bff6-285e31feb5c9','上海芒可忆','workspace-liyingke','','none','','',1,0,'','','{\"steps\": {\"site\": {\"status\": \"pending\", \"answers\": {}, \"execution\": null, \"pending_card\": null, \"applied_count\": 0, \"recent_applied_items\": []}, \"leads\": {\"status\": \"pending\", \"answers\": {}, \"execution\": null, \"pending_card\": null, \"applied_count\": 0, \"recent_applied_items\": []}, \"profile\": {\"status\": \"pending\", \"answers\": {}, \"execution\": null, \"pending_card\": null, \"applied_count\": 0, \"recent_applied_items\": []}}, \"status\": \"paused\", \"current_step\": \"profile\", \"schema_version\": 5, \"completion_acknowledged\": false, \"lead_acquisition_requirement\": \"\"}',1,'2026-08-19 10:10:45','2026-08-19 02:15:42',1);
/*!40000 ALTER TABLE `workspaces` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'mekyro'
--

--
-- Dumping routines for database 'mekyro'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-19  2:25:39
