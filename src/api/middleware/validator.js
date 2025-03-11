const Joi = require('joi');
const logger = require('../../utils/logger');

// 创建验证中间件
const validate = (schema) => {
    return (req, res, next) => {
        try {
            // 根据请求方法选择要验证的数据
            let dataToValidate;
            if (req.method === 'GET') {
                dataToValidate = req.query;
            } else {
                dataToValidate = req.body;
            }
            
            // 执行验证
            const { error, value } = schema.validate(dataToValidate, {
                abortEarly: false, // 返回所有错误
                stripUnknown: true // 移除未定义的字段
            });
            
            if (error) {
                // 格式化错误消息
                const errorMessages = error.details.map(detail => detail.message);
                
                logger.warn(`请求验证失败: ${errorMessages.join(', ')}`, {
                    url: req.originalUrl,
                    method: req.method,
                    data: dataToValidate
                });
                
                return res.status(400).json({
                    success: false,
                    error: '无效的请求数据',
                    message: errorMessages.join(', ')
                });
            }
            
            // 更新验证后的数据
            if (req.method === 'GET') {
                req.query = value;
            } else {
                req.body = value;
            }
            
            next();
        } catch (error) {
            logger.error(`验证中间件错误: ${error.message}`, { error });
            next(error);
        }
    };
};

// 常用的验证模式
const schemas = {
    // 代币相关
    token: {
        create: Joi.object({
            id: Joi.string().required(),
            symbol: Joi.string().required(),
            description: Joi.string().allow('', null),
            priority: Joi.number().integer().min(1),
            isActive: Joi.boolean()
        }),
        update: Joi.object({
            symbol: Joi.string(),
            description: Joi.string().allow('', null),
            priority: Joi.number().integer().min(1),
            isActive: Joi.boolean()
        }),
        batchCreate: Joi.object({
            tokens: Joi.array().items(Joi.object({
                id: Joi.string().required(),
                symbol: Joi.string().required(),
                description: Joi.string().allow('', null),
                priority: Joi.number().integer().min(1),
                isActive: Joi.boolean()
            })).min(1).required()
        })
    },
    
    // 告警相关
    alert: {
        createPrice: Joi.object({
            type: Joi.string().valid('price').required(),
            condition: Joi.string().valid('above', 'below').required(),
            value: Joi.number().positive().required(),
            enabled: Joi.boolean(),
            oneTime: Joi.boolean(),
            cooldown: Joi.number().integer().min(0),
            priority: Joi.string().valid('high', 'medium', 'low'),
            description: Joi.string().allow('', null)
        }),
        createPercentage: Joi.object({
            type: Joi.string().valid('percentage').required(),
            condition: Joi.string().valid('increase', 'decrease').required(),
            value: Joi.number().positive().required(),
            timeframe: Joi.number().integer().positive().required(),
            enabled: Joi.boolean(),
            oneTime: Joi.boolean(),
            cooldown: Joi.number().integer().min(0),
            priority: Joi.string().valid('high', 'medium', 'low'),
            description: Joi.string().allow('', null)
        }),
        update: Joi.object({
            type: Joi.string().valid('price', 'percentage'),
            condition: Joi.string().valid('above', 'below', 'increase', 'decrease'),
            value: Joi.number().positive(),
            timeframe: Joi.number().integer().positive(),
            enabled: Joi.boolean(),
            oneTime: Joi.boolean(),
            cooldown: Joi.number().integer().min(0),
            priority: Joi.string().valid('high', 'medium', 'low'),
            description: Joi.string().allow('', null)
        }),
        batchCreate: Joi.object({
            global: Joi.array().items(Joi.object({
                type: Joi.string().valid('price', 'percentage').required(),
                condition: Joi.string().valid('above', 'below', 'increase', 'decrease').required(),
                value: Joi.number().positive().required(),
                timeframe: Joi.when('type', {
                    is: 'percentage',
                    then: Joi.number().integer().positive().required(),
                    otherwise: Joi.number().integer().positive()
                }),
                enabled: Joi.boolean(),
                oneTime: Joi.boolean(),
                cooldown: Joi.number().integer().min(0),
                priority: Joi.string().valid('high', 'medium', 'low'),
                description: Joi.string().allow('', null)
            })),
            tokens: Joi.object().pattern(
                Joi.string(),
                Joi.array().items(Joi.object({
                    type: Joi.string().valid('price', 'percentage').required(),
                    condition: Joi.string().valid('above', 'below', 'increase', 'decrease').required(),
                    value: Joi.number().positive().required(),
                    timeframe: Joi.when('type', {
                        is: 'percentage',
                        then: Joi.number().integer().positive().required(),
                        otherwise: Joi.number().integer().positive()
                    }),
                    enabled: Joi.boolean(),
                    oneTime: Joi.boolean(),
                    cooldown: Joi.number().integer().min(0),
                    priority: Joi.string().valid('high', 'medium', 'low'),
                    description: Joi.string().allow('', null)
                }))
            )
        })
    },
    
    // 系统相关
    system: {
        cleanup: Joi.object({
            dataType: Joi.string().valid('price_history', 'alert_history', 'notification_history', 'system_logs', 'all'),
            olderThan: Joi.alternatives().try(
                Joi.number().integer().positive(),
                Joi.string().pattern(/^\d+d$/)
            )
        })
    }
};

module.exports = {
    validate,
    schemas
};